import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_PUB = 'REDIS_PUB';
export const REDIS_SUB = 'REDIS_SUB';

export const redisProvider = {
  provide: 'REDIS_CLIENT',
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const host = config.get<string>('REDIS_HOST', 'localhost');
    const port = parseInt(config.get<string>('REDIS_PORT', '6379'), 10);
    const password = config.get<string>('REDIS_PASSWORD') || undefined;
    const db = parseInt(config.get<string>('REDIS_DB', '0'), 10);
    return new Redis({ host, port, password, db, lazyConnect: false, maxRetriesPerRequest: 3 });
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  constructor() {}
  onModuleInit() {}
  onModuleDestroy() {}
}
