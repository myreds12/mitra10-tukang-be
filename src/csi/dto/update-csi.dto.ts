import { PartialType } from '@nestjs/swagger';
import { CreateCsiDto } from './create-csi.dto';

export class UpdateCsiDto extends PartialType(CreateCsiDto) {}
