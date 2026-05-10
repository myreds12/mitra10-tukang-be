import { Module } from '@nestjs/common';
import { VendorRegistrationController } from './vendor-registration.controller';
import { VendorRegistrationService } from './vendor-registration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        delay: 5000,
      },
    }),
  ],
  controllers: [VendorRegistrationController],
  providers: [VendorRegistrationService],
  exports: [VendorRegistrationService],
})
export class VendorRegistrationModule {}