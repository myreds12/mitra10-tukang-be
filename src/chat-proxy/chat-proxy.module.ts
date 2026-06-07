import { Module } from '@nestjs/common';
import { ChatProxyController } from './chat-proxy.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [ChatProxyController],
  imports: [ConfigModule],
})
export class ChatProxyModule {}
