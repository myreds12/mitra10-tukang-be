import { BadGatewayException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { DataAggregatorService, TOOL_NAMES } from './data-aggregator.service';
import { permittedTools } from './privacy-policy';

const SYSTEM = 'Anda analis aplikasi Tukang Mitra10. Jawab dalam bahasa Indonesia berdasarkan hasil tool agregasi yang tersedia. Jangan mengarang angka. Jelaskan keterbatasan, periode, data terpotong, dan data yang tidak tersedia. Gunakan setidaknya satu tool sebelum menjawab pertanyaan data. Jangan meminta atau menampilkan data pribadi.';
const TOOLS = TOOL_NAMES.map(name => ({ name, description: ({ get_transaction_summary: 'Ringkasan jumlah dan nilai transaksi', get_work_order_summary: 'Durasi pekerjaan', get_work_patterns: 'Jam mulai pekerjaan dan jumlah penugasan', get_complaint_summary: 'Jumlah dan tipe komplain', get_vendor_summary: 'Jumlah vendor dan tukang aktif dan vendor berdasarkan jumlah order', get_csi_summary: 'Jumlah respons CSI' })[name], input_schema: { type: 'object', properties: { from: { type: 'string', description: 'Tanggal awal YYYY-MM-DD inklusif' }, to: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD inklusif' } }, additionalProperties: false } }));
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
    try {
      return (await axios.post(`${base.replace(/\/$/, '')}/v1/messages${path}`, body, { headers: { 'x-api-key': process.env.AI_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: positive(process.env.AI_CLAUDE_TIMEOUT_MS, 60000, 120000), maxRedirects: 0 })).data;
    } catch (error) {
      // Do not expose the upstream response or request, which may contain credentials or data.
      throw new BadGatewayException('Layanan Claude tidak tersedia atau konfigurasi tidak valid.');
    }
  }
  async chat(userId: number, question: string, conversationId?: number, allowedFields: string[] = []) {
    const allowedTools = permittedTools(allowedFields);
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
    const maxTurns = positive(process.env.AI_AGENT_MAX_TURNS, 8, 12);
    const maxTokens = positive(process.env.AI_CLAUDE_MAX_TOKENS, 2048, 4096);
    const model = process.env.AI_CLAUDE_MODEL || 'claude-sonnet-4-5';
    let toolsCalled = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      const body = { model, system: SYSTEM, messages: clean, tools: TOOLS.filter(tool => allowedTools.includes(tool.name)) };
      const count = await this.api('/count_tokens', body);
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
        const args = validArgs ? input : {};
        let result: any; let failed = false;
        try { if (!validArgs || !allowedTools.includes(call.name)) throw new Error('Tool or arguments not allowed'); result = await this.data.run(call.name, args); toolsCalled++; } catch { failed = true; result = { error: 'Tool atau parameter tidak valid; tidak ada data yang tersedia.' }; }
        await this.db.ai_agent_tool_log.create({ data: { message_id: userMessage.id, tool_name: TOOL_NAMES.includes(call.name) ? call.name : 'unknown', arguments: JSON.stringify(args), result_digest: failed ? 'error' : 'Agregasi selesai; hasil tidak disimpan', duration_ms: Date.now() - start } });
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result), ...(failed ? { is_error: true } : {}) });
      }
      if (calls.length > 12) throw new BadGatewayException('Terlalu banyak tool dalam satu respons');
      clean.push({ role: 'user', content: results });
    }
    throw new BadGatewayException('Batas langkah analisa tercapai. Coba pertanyaan yang lebih spesifik.');
  }
}
