import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export interface AiSessionPeriod {
  from: string;
  to: string;
  date_from?: string;
  date_to?: string;
  label: string;
  quarter?: number;
  year: number;
  isDefaultAssumption?: boolean;
  assumptionNote?: string;
}

export interface AiSessionDocument {
  title: string;
  format: 'pdf' | 'word' | 'excel';
  markdown: string;
}

export interface AiSessionState {
  lastSkillId: string;
  lastPeriod: AiSessionPeriod;
  lastReportKeys: string[];
  filters: Record<string, any>;
  keyFigures: Record<string, any>;
  fetchedAt: string;
  lastDocument?: AiSessionDocument;
}

export const SESSION_TTL_SECONDS = 86400; // 24 jam
export const MAX_KEY_FIGURES_BYTES = 20 * 1024; // 20 KB

@Injectable()
export class AiSessionStateService {
  private readonly logger = new Logger(AiSessionStateService.name);
  private readonly memoryStore = new Map<string, { state: AiSessionState; expiresAt: number }>();
  private lastRedisWarnTime = 0;

  constructor(
    @Optional()
    @Inject('REDIS_CLIENT')
    private readonly redisClient?: Redis,
  ) {}

  private getSessionKey(userId: string | number, sessionId: string): string {
    return `ai:session:${String(userId).trim()}:${String(sessionId).trim()}`;
  }

  private warnRedisUnavailable(err?: any) {
    const now = Date.now();
    if (now - this.lastRedisWarnTime > 60000) {
      this.lastRedisWarnTime = now;
      this.logger.warn(
        `Redis tidak dapat digunakan untuk AI session state (${err?.message || 'client not connected'}). Menggunakan in-memory Map fallback.`,
      );
    }
  }

  async get(userId: string | number, sessionId: string): Promise<AiSessionState | null> {
    const key = this.getSessionKey(userId, sessionId);

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const raw = await this.redisClient.get(key);
        if (raw) {
          await this.redisClient.expire(key, SESSION_TTL_SECONDS);
          return JSON.parse(raw) as AiSessionState;
        }
        return null;
      } catch (err) {
        this.warnRedisUnavailable(err);
      }
    }

    const mem = this.memoryStore.get(key);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      mem.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
      return mem.state;
    }

    return null;
  }

  async set(userId: string | number, sessionId: string, state: AiSessionState): Promise<void> {
    const key = this.getSessionKey(userId, sessionId);

    let sanitizedFigures = state.keyFigures || {};
    try {
      const serialized = JSON.stringify(sanitizedFigures);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_KEY_FIGURES_BYTES) {
        const figureKeys = Object.keys(sanitizedFigures).slice(0, 15);
        const truncated: Record<string, any> = {
          _notice: 'keyFigures dipotong ke batas 20KB',
        };
        for (const k of figureKeys) {
          truncated[k] = sanitizedFigures[k];
        }
        sanitizedFigures = truncated;
      }
    } catch {
      sanitizedFigures = {};
    }

    const workingState: AiSessionState = {
      ...state,
      keyFigures: sanitizedFigures,
      fetchedAt: state.fetchedAt || new Date().toISOString(),
    };

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(key, JSON.stringify(workingState), 'EX', SESSION_TTL_SECONDS);
        return;
      } catch (err) {
        this.warnRedisUnavailable(err);
      }
    }

    this.memoryStore.set(key, {
      state: workingState,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    });
  }

  async clear(userId: string | number, sessionId: string): Promise<void> {
    const key = this.getSessionKey(userId, sessionId);

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        this.warnRedisUnavailable(err);
      }
    }

    this.memoryStore.delete(key);
  }
}
