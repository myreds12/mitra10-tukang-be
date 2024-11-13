import { PartialType } from '@nestjs/swagger';
import { CreateCrmDto } from './create-crm.dto';

export class UpdateCrmDto extends PartialType(CreateCrmDto) {}
