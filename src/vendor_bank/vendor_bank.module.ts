import { Module } from '@nestjs/common';
import { VendorBankService } from './vendor_bank.service';
import { VendorBankController } from './vendor_bank.controller';

@Module({
  controllers: [VendorBankController],
  providers: [VendorBankService]
})
export class VendorBankModule {}
