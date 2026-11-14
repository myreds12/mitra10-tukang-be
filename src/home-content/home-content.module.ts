import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HomeContentController } from './home-content.controller';
import { HomeContentService } from './home-content.service';

@Module({
  imports: [PrismaModule],
  controllers: [HomeContentController],
  providers: [HomeContentService],
})
export class HomeContentModule {}
