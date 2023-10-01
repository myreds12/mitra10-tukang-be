import { Module } from '@nestjs/common';
import { ComplaintEvidenceService } from './complaint-evidence.service';
import { ComplaintEvidenceController } from './complaint-evidence.controller';

@Module({
  controllers: [ComplaintEvidenceController],
  providers: [ComplaintEvidenceService]
})
export class ComplaintEvidenceModule {}
