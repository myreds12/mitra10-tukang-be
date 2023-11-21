import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  imports: [AuthModule],
})
export class SalesModule {}
