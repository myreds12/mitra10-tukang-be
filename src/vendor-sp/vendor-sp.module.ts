import { Module } from '@nestjs/common';
import { VendorSpController } from './vendor-sp.controller';
import { VendorSpService } from './vendor-sp.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VendorSpController],
  providers: [VendorSpService],
  exports: [VendorSpService],
})
export class VendorSpModule {}
