import { BadGatewayException, BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { DataAggregatorService, TOOL_NAMES } from './data-aggregator.service';
import { permittedTools, TOOL_FIELD_REQUIREMENTS } from './privacy-policy';

const SYSTEM = 'Jika diminta rincian, jenis, peringkat, status, atau laporan lengkap, gunakan tool rincian yang relevan dan diizinkan; jangan menggantinya dengan total saja. Untuk pengaduan, gunakan rincian per kategori order terkait, status atau kanal sesuai permintaan, tanpa mengklaim kategori order adalah penyebab komplain. Jika tool yang dibutuhkan tidak tersedia karena batasan privasi, jelaskan keterbatasannya. Untuk pertanyaan order atau layanan paling banyak, gunakan get_top_order_categories jika tersedia; jangan menggantinya dengan total transaksi. Jika fungsi peringkat tidak tersedia karena pengaturan privasi, jelaskan keterbatasan tersebut. Anda analis aplikasi Tukang Mitra10. Jawab dalam bahasa Indonesia berdasarkan hasil tool agregasi yang tersedia. Jangan mengarang angka. Jelaskan keterbatasan, periode, data terpotong, dan data yang tidak tersedia. Gunakan setidaknya satu tool sebelum menjawab pertanyaan data. Jangan meminta atau menampilkan data pribadi.';
export function buildSystemPrompt(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const year = value('year'), month = value('month'), day = value('day');
  const date = (y: number, m: number, d: number) =>
    `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  const previous = new Date(Date.UTC(year, month - 1, 0));
  const currentDate = date(year, month, day);
  const currentStart = date(year, month, 1);
  const previousStart = date(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
  const previousEnd = date(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate());
  return `${SYSTEM}
Tanggal saat ini berdasarkan jam server dalam zona Asia/Jakarta: ${currentDate}. ` +
    `Untuk pertanyaan relatif gunakan tanggal ini, bukan tanggal dari pengetahuan model. ` +
    `Secara default, "bulan ini" berarti ${currentStart} sampai ${currentDate} (termasuk kedua tanggal); ` +
    `"bulan sebelumnya" berarti ${previousStart} sampai ${previousEnd} (termasuk kedua tanggal). ` +
    `Gunakan from dan to yang eksplisit pada tool untuk setiap periode yang diminta. ` +
    `Jelaskan periode persis yang dianalisis, dan bila membandingkan bulan berjalan dengan bulan sebelumnya ` +
    `sebutkan bahwa durasi periodenya bisa berbeda. Ikuti periode eksplisit dari pengguna jika ada. ` +
    `Jangan menyatakan tanggal saat ini tidak tersedia atau menebak tanggal.`;
}

// For an unambiguous "this month" request, enforce the period in code instead
// of trusting the model to infer it. Complex comparisons keep the user's intent.
export function normalizePeriodForQuestion(question: string, input: any, now: Date = new Date()): any {
  if (!/\bbulan\s+(?:ini|sekarang)\b/i.test(question)) return input;
  if (/\b(?:sebelumnya|lalu|tahun|minggu|tanggal|hingga|sampai|antara|perbandingan|bandingkan|versus|dibanding|vs)\b|\b(?:19|20)\d{2}\b|\b\d+\s*(?:hari|bulan)\b/i.test(question)) return input;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  const year = part('year'), month = part('month'), day = part('day');
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}

// Route unambiguous ranking questions to the aggregation rather than relying on
// a model to choose a tool. More specific filters stay with the model.
export function resolveOrderRankingIntent(question: string, now: Date = new Date()): { from?: string; to?: string } | null {
  if (!/\border\b/i.test(question) || !/\b(?:paling\s+banyak|terbanyak|paling\s+sering)\b/i.test(question)) return null;
  const withoutCurrentMonth = question.replace(/\bbulan\s+(?:ini|sekarang)\b/gi, '');
  if (/\b(?:toko|store|vendor|status|wilayah|area|nominal|nilai|harga|komplain|pengaduan|bulan|tahun|minggu|hari|tanggal|periode|lalu|sebelumnya|bandingkan|banding|dibanding|versus|vs)\b|\b(?:19|20)\d{2}\b/i.test(withoutCurrentMonth)) return null;
  return normalizePeriodForQuestion(question, {}, now);
}

export const TOOLS = TOOL_NAMES.map(name => ({ name, description: ({ get_transaction_summary: 'Ringkasan total jumlah dan nilai transaksi, tanpa peringkat jenis order', get_top_order_categories: 'Peringkat 10 kategori layanan yang paling banyak dipesan berdasarkan jumlah order unik dan kuantitas item; gunakan untuk pertanyaan jenis order paling banyak', get_order_status_breakdown: 'Rincian jumlah order menurut status terakhir', get_order_store_breakdown: 'Peringkat toko berdasarkan jumlah order', get_csi_template_breakdown: 'Rincian jumlah jawaban CSI per template, tanpa skor atau isi jawaban', get_invoice_summary: 'Jumlah, total dan rata-rata invoice vendor', get_invoice_status_breakdown: 'Rincian jumlah invoice menurut kode status', get_complaint_status_breakdown: 'Rincian jumlah pengaduan menurut status terakhir', get_complaint_category_breakdown: 'Peringkat jumlah pengaduan berdasarkan kategori item pada order yang terkait; kategori order bukan penyebab komplain', get_work_duration_by_category: 'Rata-rata durasi work order menurut kategori item pada order terkait; satu work order dapat masuk beberapa kategori', get_work_start_patterns: 'Rincian jumlah work order berdasarkan jam mulai UTC', get_top_order_vendors: 'Peringkat vendor berdasarkan jumlah order', get_work_order_summary: 'Durasi pekerjaan', get_work_patterns: 'Jam mulai pekerjaan dan jumlah penugasan', get_complaint_summary: 'Jumlah pengaduan dan rinciannya menurut nama kanal', get_vendor_summary: 'Jumlah vendor dan tukang aktif dan vendor berdasarkan jumlah order', get_csi_summary: 'Jumlah respons CSI' })[name], input_schema: { type: 'object', properties: { from: { type: 'string', description: 'Tanggal awal YYYY-MM-DD inklusif' }, to: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD inklusif' } }, additionalProperties: false } }));
const positive = (value: string, fallback: number, max: number) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback; };

@Injectable()
export class AiAgentService {
  constructor(private readonly db: PrismaService, private readonly data: DataAggregatorService) {}
  private get enabled() { return process.env.AI_AGENT_ENABLED === 'true'; }
  health() { return { enabled: this.enabled, configured: !!process.env.AI_ANTHROPIC_API_KEY, model: process.env.AI_CLAUDE_MODEL || 'claude-sonnet-4-5' }; }
  async dashboard(input: any) { if (!this.enabled) throw new ServiceUnavailableException('AI Agent belum diaktifkan'); return this.data.dashboard(input); }
  async summary(name: string, input: any) { if (!this.enabled) throw new ServiceUnavailableException('AI Agent belum diaktifkan'); return this.data.run(name, input); }
  async conversations(userId: number) {
    return this.db.ai_agent_conversation.findMany({ where: { user_id: userId, is_active: true }, orderBy: { id: 'desc' }, take: 50, select: { id: true, title: true, created_at: true, messages: { where: { role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { id: 'asc' }, select: { role: true, content: true, created_at: true } } } });
  }
  private async api(path: string, body: any) {
    const base = process.env.AI_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return (await axios.post(`${base.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/messages${path}`, body, { headers: { 'x-api-key': process.env.AI_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: positive(process.env.AI_CLAUDE_TIMEOUT_MS, 60000, 120000), maxRedirects: 0 })).data;
      } catch (error) {
        // Do not expose the upstream response or request, which may contain credentials or data.
        const status = error?.response?.status;
        if (status === 429) {
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new HttpException('Penyedia AI sedang membatasi permintaan (429). Coba beberapa saat lagi atau periksa kuota dan batas penggunaan Kelontong AI.', HttpStatus.TOO_MANY_REQUESTS);
        }
        if (status === 401 || status === 403) throw new BadGatewayException('Kredensial AI ditolak. Periksa API key dan izin akses penyedia AI di backend.');
        if (status === 402) throw new BadGatewayException('Saldo penyedia AI tidak mencukupi. Periksa saldo pada akun penyedia AI.');
        throw new BadGatewayException('Layanan AI belum dapat diakses. Periksa koneksi dan konfigurasi backend.');
      }
    }
  }

  async chat(userId: number, question: string, conversationId?: number, allowedFields: string[] = []) {
    const allowedTools = permittedTools(allowedFields);
    const rankingArgs = resolveOrderRankingIntent(question);
    if (rankingArgs && !allowedTools.includes('get_top_order_categories')) {
      const missing = TOOL_FIELD_REQUIREMENTS.get_top_order_categories.filter(field => !allowedFields.includes(field)).map(field => field.replace('orders.', ''));
      throw new ForbiddenException(`Untuk peringkat kategori order, aktifkan kolom berikut di Batasan & Privasi: ${missing.join(', ')}.`);
    }
    if (!allowedTools.length) throw new ForbiddenException('Tidak ada fungsi analisa yang tersedia untuk pilihan kolom ini. Periksa Batasan & Privasi.');
    if (!this.enabled || !process.env.AI_ANTHROPIC_API_KEY) throw new ServiceUnavailableException('AI Agent belum dikonfigurasi');
    let conversation;
    if (conversationId) {
      conversation = await this.db.ai_agent_conversation.findFirst({ where: { id: conversationId, user_id: userId, is_active: true } });
      if (!conversation) throw new NotFoundException('Percakapan tidak ditemukan');
    } else conversation = await this.db.ai_agent_conversation.create({ data: { user_id: userId, title: question.slice(0, 255) } });
    // Do not resend earlier answers: they may contain data allowed under an older policy.
    const clean: any[] = [];
    clean.push({ role: 'user', content: question });
    const userMessage = await this.db.ai_agent_message.create({ data: { conversation_id: conversation.id, role: 'USER', content: question } });
    if (rankingArgs) {
      const started = Date.now();
      let result: any;
      try {
        result = await this.data.run('get_top_order_categories', rankingArgs);
      } catch (error) {
        await this.db.ai_agent_tool_log.create({ data: { message_id: userMessage.id, tool_name: 'get_top_order_categories', arguments: JSON.stringify(rankingArgs), result_digest: 'error', duration_ms: Date.now() - started } });
        if (error instanceof BadRequestException) throw error;
        throw new ServiceUnavailableException('Peringkat kategori order belum dapat dimuat. Silakan coba lagi.');
      }
      await this.db.ai_agent_tool_log.create({ data: { message_id: userMessage.id, tool_name: 'get_top_order_categories', arguments: JSON.stringify(rankingArgs), result_digest: 'Agregasi selesai; hasil tidak disimpan', duration_ms: Date.now() - started } });
      const period = rankingArgs.from && rankingArgs.to ? `${rankingArgs.from} sampai ${rankingArgs.to}` : 'seluruh periode';
      const rows = result.peringkat.map((row: any, index: number) => `| ${index + 1} | ${String(row.kategori).replace(/\|/g, '/')} | ${row.jumlah_order} | ${row.kuantitas} |`);
      const answer = rows.length
        ? [`Peringkat kategori order untuk **${period}**, berdasarkan jumlah order unik:`, '', '| No. | Kategori | Jumlah order | Kuantitas item |', '|---|---|---:|---:|', ...rows, '', 'Periode mengikuti tanggal pembuatan order dan mencakup semua status. Satu order dapat tercatat pada lebih dari satu kategori.', `Detail tanpa item yang tidak masuk peringkat: ${result.detail_tanpa_item}.`].join('\n')
        : `Tidak ada kategori order yang dapat ditampilkan untuk ${period}. Detail tanpa item yang tidak masuk peringkat: ${result.detail_tanpa_item}.`;
      await this.db.ai_agent_message.create({ data: { conversation_id: conversation.id, role: 'ASSISTANT', content: answer } });
      return { conversation_id: conversation.id, answer };
    }
    const maxTurns = positive(process.env.AI_AGENT_MAX_TURNS, 8, 12);
    const maxTokens = positive(process.env.AI_CLAUDE_MAX_TOKENS, 2048, 4096);
    const model = process.env.AI_CLAUDE_MODEL || 'claude-sonnet-4-5';
    const systemPrompt = buildSystemPrompt();
    let toolsCalled = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      const body = { model, system: systemPrompt, messages: clean, tools: TOOLS.filter(tool => allowedTools.includes(tool.name)) };
      // Some Anthropic-compatible proxies do not support /count_tokens. Reserve
      // a conservative byte-based estimate before sending any paid request.
      const count = process.env.AI_TOKEN_COUNT_MODE === 'conservative'
        ? { input_tokens: Buffer.byteLength(JSON.stringify(body), 'utf8') + 4096 }
        : await this.api('/count_tokens', body);
      if (!Number.isSafeInteger(count.input_tokens) || count.input_tokens < 0) throw new BadGatewayException('Penghitungan token Claude gagal');
      // Reserve budget atomically per user. A failed request retains its reservation because upstream usage is unknown.
      const reserve = Math.ceil(count.input_tokens * 1.1) + maxTokens;
      const limit = positive(process.env.AI_AGENT_DAILY_TOKEN_LIMIT, 500000, 100000000);
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      let usage;
      try {
        usage = await this.db.$transaction(async tx => {
          const sum = await tx.ai_agent_message.aggregate({ where: { conversation: { user_id: userId }, role: 'USAGE', created_at: { gte: day } }, _sum: { input_tokens: true, output_tokens: true } });
          if ((sum._sum.input_tokens || 0) + (sum._sum.output_tokens || 0) + reserve > limit) throw new ForbiddenException('Batas token harian AI Agent tercapai');
          return tx.ai_agent_message.create({ data: { conversation_id: conversation.id, role: 'USAGE', content: 'reserved', input_tokens: reserve } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (e) { if (e instanceof ForbiddenException) throw e; throw new ServiceUnavailableException('Tidak dapat memesan kuota; silakan coba lagi.'); }
      const response = await this.api('', { ...body, max_tokens: maxTokens });
      const usedInput = Number(response.usage?.input_tokens), usedOutput = Number(response.usage?.output_tokens);
      if (Number.isSafeInteger(usedInput) && usedInput >= 0 && Number.isSafeInteger(usedOutput) && usedOutput >= 0) await this.db.ai_agent_message.update({ where: { id: usage.id }, data: { input_tokens: usedInput, output_tokens: usedOutput, content: 'completed' } });
      if (!Array.isArray(response.content)) throw new BadGatewayException('Respons Claude tidak valid');
      const calls = response.content.filter((x: any) => x.type === 'tool_use');
      if (!calls.length) {
        const answer = response.content.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n').trim();
        if (!answer) throw new BadGatewayException('Claude tidak menghasilkan jawaban');
        const final = toolsCalled ? answer : 'Saya belum mendapatkan data untuk menjawab. Silakan ajukan pertanyaan yang dapat dijawab dari ringkasan data aplikasi.';
        await this.db.ai_agent_message.create({ data: { conversation_id: conversation.id, role: 'ASSISTANT', content: final } });
        return { conversation_id: conversation.id, answer: final };
      }
      clean.push({ role: 'assistant', content: response.content });
      const results = [];
      for (const call of calls.slice(0, 12)) {
        const start = Date.now();
        const input = call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {};
        const validArgs = Object.keys(input).every(key => ['from', 'to'].includes(key)) && ['from', 'to'].every(key => input[key] === undefined || (typeof input[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input[key])));
        const args = validArgs ? normalizePeriodForQuestion(question, input) : {};
        // Echo the enforced arguments in the assistant tool-use block as well as the result.
        if (validArgs) call.input = args;
        let result: any; let failed = false;
        try { if (!validArgs || !allowedTools.includes(call.name)) throw new Error('Tool or arguments not allowed'); result = await this.data.run(call.name, args);
          if (result && typeof result === 'object' && (args.from || args.to)) result = { ...result, periode_query: { dari: args.from || null, sampai: args.to || null } };
          toolsCalled++; } catch { failed = true; result = { error: 'Tool atau parameter tidak valid; tidak ada data yang tersedia.' }; }
        await this.db.ai_agent_tool_log.create({ data: { message_id: userMessage.id, tool_name: TOOL_NAMES.includes(call.name) ? call.name : 'unknown', arguments: JSON.stringify(args), result_digest: failed ? 'error' : 'Agregasi selesai; hasil tidak disimpan', duration_ms: Date.now() - start } });
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result), ...(failed ? { is_error: true } : {}) });
      }
      if (calls.length > 12) throw new BadGatewayException('Terlalu banyak tool dalam satu respons');
      clean.push({ role: 'user', content: results });
    }
    throw new BadGatewayException('Batas langkah analisa tercapai. Coba pertanyaan yang lebih spesifik.');
  }
}
