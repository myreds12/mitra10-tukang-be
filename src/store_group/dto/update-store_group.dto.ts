import { PartialType } from '@nestjs/swagger';
import { CreateStoreGroupDto } from './create-store_group.dto';

export class UpdateStoreGroupDto extends PartialType(CreateStoreGroupDto) {}
