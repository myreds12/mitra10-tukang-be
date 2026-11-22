import axios from 'axios';
import { AiAgentService, buildSystemPrompt, normalizePeriodForQuestion, resolveOrderRankingIntent, resolveOrderItemsIntent, resolveItemListIntent, resolveDatasetListIntent } from './ai-agent.service';
import { DataAggregatorService } from './data-aggregator.service';
import { PRIVACY_FIELDS, permittedTools } from './privacy-policy';
import { AiAgentGuard } from './ai-agent.controller';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;

describe('AI Agent', () => {
  const oldEnv = process.env;
  beforeEach(() => { process.env = { ...oldEnv, AI_AGENT_ENABLED: 'true', AI_ANTHROPIC_API_KEY: 'test-key', AI_AGENT_DAILY_TOKEN_LIMIT: '500000', AI_TOKEN_COUNT_MODE: 'api' }; jest.resetAllMocks(); });
  afterAll(() => { process.env = oldEnv; });

  it('uses Jakarta calendar dates for the current and previous month, including the year boundary', () => {
    const prompt = buildSystemPrompt(new Date('2026-12-31T18:00:00Z'));
    expect(prompt).toContain('2027-01-01');
    expect(prompt).toContain('2026-12-01 sampai 2026-12-31');
    expect(prompt).toContain('2027-01-01 sampai 2027-01-01');
    expect(buildSystemPrompt(new Date('2024-03-15T12:00:00Z'))).toContain('2024-02-01 sampai 2024-02-29');
  });

  it('enforces the correct Jakarta period for a simple this-month request', () => {
    const now = new Date('2026-11-13T15:00:00Z');
    expect(normalizePeriodForQuestion('Pengaduan apa yang paling banyak bulan ini?', { from: '2025-06-01', to: '2025-06-30' }, now)).toEqual({ from: '2026-11-01', to: '2026-11-13' });
    const original = { from: '2025-06-01', to: '2025-06-30' };
    expect(normalizePeriodForQuestion('Bandingkan bulan ini dan bulan sebelumnya', original, now)).toEqual(original);
    expect(normalizePeriodForQuestion('Bandingkan bulan ini dengan tahun 2025', original, now)).toEqual(original);
  });

  it('recognizes only unambiguous order-ranking requests', () => {
    const now = new Date('2026-11-13T15:00:00Z');
    expect(resolveOrderRankingIntent('Tolong anlisa order apa yang paling banyak?', now)).toEqual({});
    expect(resolveOrderRankingIntent('Order paling banyak bulan ini?', now)).toEqual({ from: '2026-11-01', to: '2026-11-13' });
    expect(resolveOrderRankingIntent('Toko dengan order paling banyak bulan ini?', now)).toBeNull();
    expect(resolveOrderRankingIntent('Order paling banyak bulan lalu?', now)).toBeNull();
  });

  it('finds items for a specific order without relying on an AI response', async () => {
    expect(resolveOrderItemsIntent('tampilakn item di Order ID 6911')).toBe(6911);
    expect(resolveOrderItemsIntent('hapus item Order ID 6911')).toBeNull();
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: { create: jest.fn().mockResolvedValue({ id: 7 }) }, ai_agent_tool_log: { create: jest.fn() } };
    const catalog = { orderItems: jest.fn().mockResolvedValue({ fields: ['item_name', 'quantity'], data: [{ item_name: 'Keramik', quantity: 2 }], more: false }) };
    const result = await new AiAgentService(db, {} as any, undefined, catalog as any).chat(5, 'tampilakn item di Order ID 6911', undefined, PRIVACY_FIELDS);
    expect(result.answer).toContain('| Keramik | 2 |');
    expect(catalog.orderItems).toHaveBeenCalledWith(6911, PRIVACY_FIELDS);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('routes the complete-order request to all permitted fields without allowing the model to summarize it', async () => {
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: { create: jest.fn().mockResolvedValue({ id: 7 }) }, ai_agent_tool_log: { create: jest.fn() } };
    const orderDetail = { read: jest.fn().mockResolvedValue({ sections: [{ dataset: 'orders', title: 'Order', fields: ['id', 'receipt_number', 'project_number'], data: [{ id: 6911, receipt_number: 'RECEIPT_TEST', project_number: 'CONTACT_TEST' }], more: false }], limitations: [] }) };
    const result = await new AiAgentService(db, {} as any, undefined, undefined, orderDetail as any).chat(5, 'tampilkan data lengkap untuk order id 6911', undefined, PRIVACY_FIELDS);
    expect(orderDetail.read).toHaveBeenCalledWith(6911, PRIVACY_FIELDS);
    expect(result.answer).toContain('RECEIPT_TEST');
    expect(result.answer).toContain('CONTACT_TEST');
    expect(http.post).not.toHaveBeenCalled();
    const audit = db.ai_agent_tool_log.create.mock.calls[0][0].data;
    expect(audit.tool_name).toBe('get_order_detail');
    expect(audit.arguments).not.toContain('6911');
    expect(audit.arguments).not.toContain('CONTACT_TEST');
    expect(db.ai_agent_message.create).toHaveBeenLastCalledWith({ data: { conversation_id: 2, role: 'ASSISTANT', content: result.answer } });
  });

  it('lists permitted master items with an explicit next page', async () => {
    expect(resolveItemListIntent('tampilakn item yang ada di aplikasi sekarang')).toBe(1);
    expect(resolveItemListIntent('tampilkan semua item di aplikasi halaman 2')).toBe(2);
    expect(resolveItemListIntent('tampilkan item aplikasi berdasarkan kategori')).toBeNull();
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: { create: jest.fn().mockResolvedValue({ id: 7 }) }, ai_agent_tool_log: { create: jest.fn() } };
    const catalog = { listItems: jest.fn().mockResolvedValue({ fields: ['item_name'], data: [{ item_name: 'Keramik' }], more: true }) };
    const result = await new AiAgentService(db, {} as any, undefined, catalog as any).chat(5, 'tampilakn item yang ada di aplikasi sekarang', undefined, PRIVACY_FIELDS);
    expect(result.answer).toContain('| Keramik |');
    expect(result.answer).toContain('halaman 2');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('lists any explicitly named permitted dataset without requiring the provider', async () => {
    expect(resolveDatasetListIntent('tampilkan data complaints halaman 2')).toEqual({ dataset: 'complaints', page: 2 });
    expect(resolveDatasetListIntent('tampilkan data ai_agent_message')).toBeNull();
    expect(resolveDatasetListIntent('tampilkan data complaints status selesai')).toBeNull();
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: { create: jest.fn().mockResolvedValue({ id: 7 }) }, ai_agent_tool_log: { create: jest.fn() } };
    const catalog = { search: jest.fn().mockResolvedValue({ data: [{ id: 7, status: 2 }], masih_ada_data: true }) };
    const allowed = ['db.invoices.id', 'db.invoices.status'];
    const result = await new AiAgentService(db, {} as any, undefined, catalog as any).chat(5, 'tampilkan data invoices', undefined, allowed);
    expect(result.answer).toContain('| 7 | 2 |');
    expect(result.answer).toContain('tampilkan data invoices halaman 2');
    expect(catalog.search).toHaveBeenCalledWith({ dataset: 'invoices', fields: ['id', 'status'], page: 1, limit: 10 }, allowed);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('retries an empty response and accepts the next response', async () => {
    const message = { create: jest.fn().mockResolvedValue({ id: 7 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }), update: jest.fn() };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message, ai_agent_tool_log: { create: jest.fn() } };
    db.$transaction = jest.fn(async callback => callback(db));
    http.post.mockResolvedValueOnce({ data: { input_tokens: 10 } } as any)
      .mockResolvedValueOnce({ data: { content: [] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 10 } } as any)
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Tidak ada data.' } }] } } as any);
    const response = await new AiAgentService(db, {} as any).chat(5, 'Pertanyaan umum', undefined, PRIVACY_FIELDS);
    expect(response.answer).toContain('belum mendapatkan data');
    expect(http.post).toHaveBeenCalledTimes(4);
  });

  it('uses a compatible tool-calling protocol after a thinking-only response and reads another dataset', async () => {
    const message = { create: jest.fn().mockResolvedValue({ id: 7 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }), update: jest.fn() };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message, ai_agent_tool_log: { create: jest.fn() } };
    db.$transaction = jest.fn(async callback => callback(db));
    const catalog = { search: jest.fn().mockResolvedValue({ dataset: 'items', data: [{ item_name: 'Keramik' }] }) };
    http.post.mockResolvedValueOnce({ data: { input_tokens: 10 } } as any)
      .mockResolvedValueOnce({ data: { content: [{ type: 'thinking', thinking: 'SECRET_REASONING_TEST_8741' }] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 10 } } as any)
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search_data', arguments: JSON.stringify({ dataset: 'items', fields: ['item_name'] }) } }] } }] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 10 } } as any)
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Ada item Keramik.' } }] } } as any);
    const response = await new AiAgentService(db, {} as any, undefined, catalog as any).chat(5, 'Cari item di katalog', undefined, PRIVACY_FIELDS);
    expect(response.answer).toBe('Ada item Keramik.');
    expect(catalog.search).toHaveBeenCalledWith({ dataset: 'items', fields: ['item_name'] }, PRIVACY_FIELDS);
    const lastBody: any = http.post.mock.calls[5][1];
    expect(lastBody.messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'call-1')).toBe(true);
    expect(JSON.stringify(lastBody)).not.toContain('SECRET_REASONING_TEST_8741');
  });

  it('answers a ranking request from aggregated data and audits it without calling the model', async () => {
    const db: any = {
      ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) },
      ai_agent_message: { create: jest.fn().mockResolvedValue({ id: 7 }) },
      ai_agent_tool_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const aggregator = { run: jest.fn().mockResolvedValue({ peringkat: [{ kategori: 'KERAMIK', jumlah_order: 3, kuantitas: 5 }], detail_tanpa_item: 1 }) };
    const result = await new AiAgentService(db, aggregator as any).chat(5, 'Tolong anlisa order apa yang paling banyak?', undefined, PRIVACY_FIELDS);
    expect(result.answer).toContain('| 1 | KERAMIK | 3 | 5 |');
    expect(result.answer).toContain('seluruh periode');
    expect(aggregator.run).toHaveBeenCalledWith('get_top_order_categories', {});
    expect(db.ai_agent_tool_log.create).toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('reports missing privacy permission for an order ranking before querying', async () => {
    const db = { ai_agent_conversation: { create: jest.fn() } };
    const data = { run: jest.fn() };
    const request = new AiAgentService(db as any, data as any).chat(5, 'Order apa yang paling banyak?', undefined, PRIVACY_FIELDS.filter(x => x !== 'orders.kategori'));
    await expect(request).rejects.toThrow('aktifkan kolom berikut di Batasan & Privasi: kategori');
    expect(data.run).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('validates periods and refuses tools outside the allowlist', async () => {
    const agent = new DataAggregatorService({} as any);
    await expect(agent.run('raw_sql', {})).rejects.toThrow();
    await expect(agent.run('get_transaction_summary', { from: '2026-02-30' })).rejects.toThrow();
    await expect(agent.run('get_transaction_summary', { from: '2026-10-01', to: '2026-01-01' })).rejects.toThrow();
  });

  it('ranks categories by unique orders without exposing order IDs', async () => {
    const db = {
      m_order_details: {
        groupBy: jest.fn().mockResolvedValue([
          { order_id: 1, item_id: 10, _sum: { quantity: 2 } },
          { order_id: 1, item_id: 11, _sum: { quantity: 3 } },
          { order_id: 2, item_id: 10, _sum: { quantity: 1 } },
          { order_id: 2, item_id: 12, _sum: { quantity: 4 } },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      items: { findMany: jest.fn().mockResolvedValue([
        { id: 10, category: { id: 1, category_name: 'Keramik' } },
        { id: 11, category: { id: 1, category_name: 'Keramik' } },
        { id: 12, category: { id: 2, category_name: 'Cat' } },
      ]) },
    };
    const result: any = await new DataAggregatorService(db as any).run('get_top_order_categories', { from: '2026-11-01', to: '2026-11-13' });
    expect(result.peringkat).toEqual([{ kategori: 'Keramik', jumlah_order: 2, kuantitas: 6 }, { kategori: 'Cat', jumlah_order: 1, kuantitas: 4 }]);
    expect(result.detail_tanpa_item).toBe(1);
    expect(JSON.stringify(result)).not.toContain('order_id');
    expect(permittedTools(PRIVACY_FIELDS.filter(field => field !== 'orders.kategori'))).not.toContain('get_top_order_categories');
  });

  it('counts complaints by linked category without double-counting duplicate items', async () => {
    const db = {
      complaints: { groupBy: jest.fn().mockResolvedValue([{ order_id: 1, _count: { _all: 2 } }, { order_id: 2, _count: { _all: 1 } }]) },
      m_order_details: { findMany: jest.fn().mockResolvedValue([
        { order_id: 1, item: { category: { id: 1, category_name: 'Keramik' } } },
        { order_id: 1, item: { category: { id: 1, category_name: 'Keramik' } } },
        { order_id: 1, item: { category: { id: 2, category_name: 'Cat' } } },
      ]) },
    };
    const result: any = await new DataAggregatorService(db as any).run('get_complaint_category_breakdown', { from: '2026-11-01', to: '2026-11-13' });
    expect(result.berdasarkan_kategori).toEqual([{ kategori: 'Cat', jumlah_pengaduan: 2 }, { kategori: 'Keramik', jumlah_pengaduan: 2 }]);
    expect(result.total_pengaduan).toBe(3);
    expect(result.pengaduan_tanpa_kategori).toBe(1);
    expect(permittedTools(PRIVACY_FIELDS.filter(x => x !== 'complaints.kategori'))).not.toContain('get_complaint_category_breakdown');
    expect(permittedTools(PRIVACY_FIELDS)).toContain('get_complaint_status_breakdown');
  });

  it('calculates average work duration once per order and category', async () => {
    const db = {
      work_orders: { findMany: jest.fn().mockResolvedValue([
        { order_id: 1, work_start_date: new Date('2026-11-01T00:00:00Z'), work_end_date: new Date('2026-11-01T02:00:00Z') },
        { order_id: 2, work_start_date: new Date('2026-11-02T00:00:00Z'), work_end_date: new Date('2026-11-02T04:00:00Z') },
        { order_id: 3, work_start_date: new Date('2026-11-03T04:00:00Z'), work_end_date: new Date('2026-11-03T02:00:00Z') },
      ]) },
      m_order_details: { findMany: jest.fn().mockResolvedValue([
        { order_id: 1, item: { category: { id: 1, category_name: 'Keramik' } } },
        { order_id: 1, item: { category: { id: 1, category_name: 'Keramik' } } },
        { order_id: 2, item: { category: { id: 1, category_name: 'Keramik' } } },
      ]) },
    };
    const result: any = await new DataAggregatorService(db as any).run('get_work_duration_by_category', {});
    expect(result.jumlah_work_order_valid).toBe(2);
    expect(result.berdasarkan_kategori).toEqual([{ kategori: 'Keramik', jumlah_work_order: 2, rata_rata_jam: 3 }]);
  });

  it('requires both an active HO role and the CASL permission', async () => {
    const db = { users: { findFirst: jest.fn().mockResolvedValue(null) } };
    const casl = { createForUser: jest.fn().mockResolvedValue({ can: () => true }) };
    const guard = new AiAgentGuard(db as any, casl as any);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 9 } }) }) };
    await expect(guard.canActivate(context as any)).rejects.toThrow();
    db.users.findFirst.mockResolvedValue({ id: 9 });
    casl.createForUser.mockResolvedValue({ can: () => false });
    await expect(guard.canActivate(context as any)).rejects.toThrow();
  });

  it('executes only an aggregate tool, audits it and returns the answer', async () => {
    const message = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValueOnce({ id: 7 }).mockResolvedValue({ id: 8 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }), update: jest.fn().mockResolvedValue({}) };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message, ai_agent_tool_log: { create: jest.fn() } };
    db.$transaction = jest.fn(async callback => callback(db));
    const data = { run: jest.fn().mockResolvedValue({ total_order: 10 }) };
    http.post.mockResolvedValueOnce({ data: { input_tokens: 100 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 'tool-1', name: 'get_transaction_summary', input: {} }] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 150 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 150, output_tokens: 30 }, content: [{ type: 'text', text: 'Ada 10 order.' }] } } as any);
    const result = await new AiAgentService(db, data as any).chat(5, 'Berapa order?', undefined, PRIVACY_FIELDS);
    expect(result).toEqual({ conversation_id: 2, answer: 'Ada 10 order.' });
    expect((http.post.mock.calls[0][1] as any).system).toContain('zona Asia/Jakarta');
    expect((http.post.mock.calls[0][1] as any).system).toContain('Gunakan from dan to yang eksplisit');
    expect(data.run).toHaveBeenCalledWith('get_transaction_summary', {});
    expect(db.ai_agent_tool_log.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tool_name: 'get_transaction_summary', result_digest: 'Agregasi selesai; hasil tidak disimpan' }) }));
  });

  it('routes detail search with the allowed fields and does not log filter values', async () => {
    const message = { create: jest.fn().mockResolvedValue({ id: 7 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }), update: jest.fn().mockResolvedValue({}) };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message, ai_agent_tool_log: { create: jest.fn() } };
    db.$transaction = jest.fn(async callback => callback(db));
    const detail = { run: jest.fn().mockResolvedValue({ data: [{ order_id: 1, vendor: 'CV Contoh Rahasia' }], masih_ada_data: false }) };
    http.post.mockResolvedValueOnce({ data: { input_tokens: 100 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 'detail-1', name: 'search_orders', input: { vendor: 'CV Contoh Rahasia', fields: ['order_id', 'vendor'] } }] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 150 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 150, output_tokens: 20 }, content: [{ type: 'text', text: 'Order 1.' }] } } as any);
    const response = await new AiAgentService(db, {} as any, detail as any).chat(5, 'Tampilkan order vendor CV Contoh Rahasia bulan ini', undefined, PRIVACY_FIELDS);
    expect(response.answer).toBe('Order 1.');
    expect(detail.run).toHaveBeenCalledWith('search_orders', expect.objectContaining({ vendor: 'CV Contoh Rahasia', fields: ['order_id', 'vendor'], from: expect.any(String), to: expect.any(String) }), PRIVACY_FIELDS);
    expect(JSON.stringify(db.ai_agent_tool_log.create.mock.calls)).not.toContain('CV Contoh Rahasia');
    expect(JSON.stringify(db.ai_agent_tool_log.create.mock.calls)).toContain('filter_names');
  });

  it('blocks a tool when one of its fields is disabled', async () => {
    const withoutTotal = PRIVACY_FIELDS.filter(field => field !== 'orders.grand_total');
    expect(permittedTools(withoutTotal)).not.toContain('get_transaction_summary');
    expect(permittedTools([])).toEqual([]);
    expect(permittedTools(PRIVACY_FIELDS)).toContain('get_csi_template_breakdown');
    expect(permittedTools(PRIVACY_FIELDS.filter(field => field !== 'csi.template'))).not.toContain('get_csi_template_breakdown');
    const db = { ai_agent_conversation: { create: jest.fn() } };
    await expect(new AiAgentService(db as any, {} as any).chat(5, 'test', undefined, [])).rejects.toThrow('Tidak ada fungsi');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not execute a disallowed tool even if Claude requests it', async () => {
    const message = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 7 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }), update: jest.fn().mockResolvedValue({}) };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message, ai_agent_tool_log: { create: jest.fn() } };
    db.$transaction = jest.fn(async callback => callback(db));
    const data = { run: jest.fn() };
    http.post.mockResolvedValueOnce({ data: { input_tokens: 100 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 'blocked', name: 'get_transaction_summary', input: {} }] } } as any)
      .mockResolvedValueOnce({ data: { input_tokens: 100 } } as any)
      .mockResolvedValueOnce({ data: { usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Tidak tersedia' }] } } as any);
    await new AiAgentService(db, data as any).chat(5, 'test', undefined, PRIVACY_FIELDS.filter(x => x !== 'orders.grand_total'));
    expect(data.run).not.toHaveBeenCalled();
    expect(db.ai_agent_tool_log.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({result_digest: 'error'})}));
  });

  it('retries a provider rate limit once and returns an actionable error', async () => {
    jest.useFakeTimers();
    const message = { create: jest.fn().mockResolvedValue({ id: 7 }), aggregate: jest.fn().mockResolvedValue({ _sum: { input_tokens: 0, output_tokens: 0 } }) };
    const db: any = { ai_agent_conversation: { create: jest.fn().mockResolvedValue({ id: 2 }) }, ai_agent_message: message };
    db.$transaction = jest.fn(async callback => callback(db));
    process.env.AI_TOKEN_COUNT_MODE = 'conservative';
    http.post.mockRejectedValue({ response: { status: 429 } });
    const request = new AiAgentService(db, {} as any).chat(5, 'Berapa order?', undefined, PRIVACY_FIELDS);
    const check = expect(request).rejects.toThrow('Penyedia AI sedang membatasi permintaan (429)');
    for (let i = 0; i < 10 && http.post.mock.calls.length === 0; i++) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    await check;
    expect(http.post).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('rejects another user’s conversation before calling Claude', async () => {
    const db = { ai_agent_conversation: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new AiAgentService(db as any, {} as any).chat(5, 'test', 42, PRIVACY_FIELDS)).rejects.toThrow('Percakapan tidak ditemukan');
    expect(http.post).not.toHaveBeenCalled();
  });
});
