import { PartialType } from '@nestjs/swagger';
import { CreateComplaintEvidenceDto } from './create-complaint-evidence.dto';

export class UpdateComplaintEvidenceDto extends PartialType(CreateComplaintEvidenceDto) {}
