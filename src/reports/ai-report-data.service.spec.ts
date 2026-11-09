import { BadRequestException, Logger } from '@nestjs/common';
import { AiReportDataService } from './ai-report-data.service';
import { AiSessionStateService } from './ai-session-state.service';
import { AiSqlExecutorService } from './ai-sql-executor.service';

describe('AiReportDataService - Bagian 2 & 3: Session State & Intent Gate', () => {
  let service: AiReportDataService;
  let sessionStateService: AiSessionStateService;
  let sqlExecutorService: AiSqlExecutorService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NINE_ROUTER_BASE_URL;
    delete process.env.DEPLOY_BASE_URL;
    delete process.env.AI_MAX_TOKENS;

    sessionStateService = new AiSessionStateService();
    sqlExecutorService = new AiSqlExecutorService({} as any);

    service = new AiReportDataService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      sessionStateService,
      sqlExecutorService,
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('2.1 menolak request tanpa sessionId atau sessionId tidak valid dengan 400 BadRequestException', async () => {
    await expect(
      service.handleAiChat(
        {
          userPrompt: 'halo',
          engineMode: '9router-gemini',
        },
        { id: 1, roles: { name: 'Admin HO' } },
      ),
    ).rejects.toThrow(/sessionId wajib diisi/i);

    await expect(
      service.handleAiChat(
        {
          sessionId: 'inv!@#',
          userPrompt: 'halo',
          engineMode: '9router-gemini',
        },
        { id: 1, roles: { name: 'Admin HO' } },
      ),
    ).rejects.toThrow(/sessionId wajib diisi/i);
  });

  it('1b.1 mengabaikan body.apiKey dan body.baseUrl serta menggunakan env/default server', async () => {
    process.env.NINE_ROUTER_BASE_URL = 'http://internal-llm.mitra10.local:20128/v1';
    process.env.NINE_ROUTER_API_KEY = 'server-secret-env-key';

    const fetchCalls: Array<{ url: string; options: any }> = [];
    (global as any).fetch = jest.fn(async (url: string, options: any) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hasil analisis order.' } }],
        }),
      };
    });

    await service.handleAiChat(
      {
        sessionId: 'sess-test-001',
        userPrompt: 'rekap order bulan ini',
        engineMode: '9router-gemini',
        baseUrl: 'https://attacker-controlled.example.com/v1',
        apiKey: 'attacker-injected-key',
      } as any,
      { id: 1, roles: { name: 'Admin HO' } },
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://internal-llm.mitra10.local:20128/v1/chat/completions');
    expect(fetchCalls[0].options.headers.Authorization).toBe('Bearer server-secret-env-key');
  });

  it('1b.1 menolak engineMode yang tidak dikenal dengan 400 BadRequestException', async () => {
    await expect(
      service.handleAiChat(
        {
          sessionId: 'sess-test-002',
          userPrompt: 'halo',
          engineMode: 'unknown-custom-engine',
        },
        { id: 1, roles: { name: 'Admin HO' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('1b.3 menolak claude-api dan openrouter dengan 400 jika API key env belum dikonfigurasi', async () => {
    await expect(
      service.handleAiChat(
        {
          sessionId: 'sess-test-003',
          userPrompt: 'halo',
          engineMode: 'claude-api',
        },
        { id: 1, roles: { name: 'Admin HO' } },
      ),
    ).rejects.toThrow(/belum dikonfigurasi di server/i);

    await expect(
      service.handleAiChat(
        {
          sessionId: 'sess-test-004',
          userPrompt: 'halo',
          engineMode: 'openrouter',
        },
        { id: 1, roles: { name: 'Admin HO' } },
      ),
    ).rejects.toThrow(/belum dikonfigurasi di server/i);
  });

  it('3.1 sapaan atau tes menghasilkan respons greeting tanpa membuat dokumen dan tanpa query DB', async () => {
    const res = await service.handleAiChat(
      {
        sessionId: 'sess-greet-001',
        userPrompt: 'tes',
        engineMode: '9router-gemini',
      },
      { id: 10, roles: { name: 'Admin HO' } },
    );

    expect(res.content).toContain('Halo! Saya AI Report Assistant');
    expect(res.content).not.toContain('<dokumen');
    expect(res.aiMeta.intent).toBe('greeting');
  });

  it('3.6 pertanyaan tanpa kata kunci domain dan tanpa sessionState menghasilkan klarifikasi satu kalimat', async () => {
    const res = await service.handleAiChat(
      {
        sessionId: 'sess-unclear-001',
        userPrompt: 'tolong cek data yang ada',
        engineMode: '9router-gemini',
      },
      { id: 10, roles: { name: 'Admin HO' } },
    );

    expect(res.content).toContain('Permintaan Anda belum spesifik');
    expect(res.content).toContain('1) Order & Omzet');
    expect(res.aiMeta.intent).toBe('clarification');
  });

  it('3.4 format switch ("jadikan word") mengembalikan dokumen lama dengan format baru tanpa query database', async () => {
    await sessionStateService.set(10, 'sess-doc-001', {
      lastSkillId: 'vendor_sp_and_performance',
      lastPeriod: {
        from: '2026-04-01',
        to: '2026-06-30',
        date_from: '2026-04-01',
        date_to: '2026-06-30',
        label: 'Kuartal 2 2026 (Apr - Jun)',
        quarter: 2,
        year: 2026,
      },
      lastReportKeys: ['evaluasi_sp_vendor'],
      filters: {},
      keyFigures: { total: 3 },
      fetchedAt: new Date().toISOString(),
      lastDocument: {
        title: 'Evaluasi SP Vendor Q2',
        format: 'pdf',
        markdown: '# Evaluasi SP Vendor\n\n- 3 Vendor terkena SP1.',
      },
    });

    const res = await service.handleAiChat(
      {
        sessionId: 'sess-doc-001',
        userPrompt: 'jadikan word',
        engineMode: '9router-gemini',
      },
      { id: 10, roles: { name: 'Admin HO' } },
    );

    expect(res.content).toContain('<dokumen format="word" judul="Evaluasi SP Vendor Q2">');
    expect(res.content).toContain('- 3 Vendor terkena SP1.');
    expect(res.aiMeta.intent).toBe('format_switch');

    const updated = await sessionStateService.get(10, 'sess-doc-001');
    expect(updated?.lastDocument?.format).toBe('word');
  });

  it('3.2 pesan lanjutan mewarisi skill dan periode dari sessionState sebelumnya', async () => {
    await sessionStateService.set(10, 'sess-follow-001', {
      lastSkillId: 'commission_and_incentive_report',
      lastPeriod: {
        from: '2026-10-01',
        to: '2026-10-31',
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        label: 'Oktober 2026',
        year: 2026,
      },
      lastReportKeys: ['komisi_sales'],
      filters: {},
      keyFigures: { total: 10 },
      fetchedAt: new Date().toISOString(),
    });

    (service as any).fetchSingleCatalogReport = jest.fn(async () => ({
      key: 'komisi_sales',
      title: 'Laporan Komisi Sales',
      aggregates: { total_komisi: 5000000 },
      sampleRows: [],
      meta: { total: 1, ditampilkan: 1, periode: 'Oktober 2026', sumber: 'reports', waktu: '', excludedTestCount: 0 },
    }));

    const res = await service.handleAiChat(
      {
        sessionId: 'sess-follow-001',
        userPrompt: 'lanjutkan untuk toko yang sama',
        engineMode: 'local-analyst',
      },
      { id: 10, roles: { name: 'Admin HO' } },
    );

    expect(res.aiMeta.intent).toBe('follow_up');
    expect(res.aiMeta.skillId).toBe('commission_and_incentive_report');
    expect(res.aiMeta.period.label).toBe('Oktober 2026');
  });
});
