import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class ServiceType {
  @Type(() => Number)
  @IsOptional()
  id?: number;

  @Type(() => Number)
  @IsNumber()
  service_type_id: number;
}
