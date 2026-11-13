import axios from 'axios';
import { AiAgentService } from './ai-agent.service';
import { DataAggregatorService } from './data-aggregator.service';
import { PRIVACY_FIELDS, permittedTools } from './privacy-policy';
import { AiAgentGuard } from './ai-agent.controller';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;

describe('AI Agent', () => {
  const oldEnv = process.env;
  beforeEach(() => { process.env = { ...oldEnv, AI_AGENT_ENABLED: 'true', AI_ANTHROPIC_API_KEY: 'test-key', AI_AGENT_DAILY_TOKEN_LIMIT: '500000' }; jest.resetAllMocks(); });
  afterAll(() => { process.env = oldEnv; });

  it('validates periods and refuses tools outside the allowlist', async () => {
    const agent = new DataAggregatorService({} as any);
    await expect(agent.run('raw_sql', {})).rejects.toThrow();
    await expect(agent.run('get_transaction_summary', { from: '2026-02-30' })).rejects.toThrow();
    await expect(agent.run('get_transaction_summary', { from: '2026-10-01', to: '2026-01-01' })).rejects.toThrow();
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
    expect(data.run).toHaveBeenCalledWith('get_transaction_summary', {});
    expect(db.ai_agent_tool_log.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tool_name: 'get_transaction_summary', result_digest: 'Agregasi selesai; hasil tidak disimpan' }) }));
  });

  it('blocks a tool when one of its fields is disabled', async () => {
    const withoutTotal = PRIVACY_FIELDS.filter(field => field !== 'orders.grand_total');
    expect(permittedTools(withoutTotal)).not.toContain('get_transaction_summary');
    expect(permittedTools([])).toEqual([]);
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

  it('rejects another user’s conversation before calling Claude', async () => {
    const db = { ai_agent_conversation: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new AiAgentService(db as any, {} as any).chat(5, 'test', 42, PRIVACY_FIELDS)).rejects.toThrow('Percakapan tidak ditemukan');
    expect(http.post).not.toHaveBeenCalled();
  });
});
