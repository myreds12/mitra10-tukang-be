import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CreateTukangServiceDto {
  @IsInt()
  tukang_id?: number;

  @IsInt()
  service_type_id?: number;

  @IsBoolean()
  is_active?: boolean;

  // Other fields can be added here

  // You can add more validation decorators for created_by, updated_by, deleted_by if needed
}
