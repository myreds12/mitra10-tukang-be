import { PartialType } from '@nestjs/swagger';
import { CreateTukangServiceDto } from './create-tukang_service.dto';

export class UpdateTukangServiceDto extends PartialType(CreateTukangServiceDto) {}
