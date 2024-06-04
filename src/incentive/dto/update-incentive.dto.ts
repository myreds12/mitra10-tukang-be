import { PartialType } from '@nestjs/swagger';
import { CreateIncentiveDto } from './create-incentive.dto';

export class UpdatedIncentiveDto extends PartialType(
  CreateIncentiveDto,
) {}
