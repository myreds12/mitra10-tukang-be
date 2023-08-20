import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CreateVendorServiceDto {
  @IsInt()
  @IsOptional()
  vendor_id?: number;

  @IsInt()
  @IsOptional()
  service_type_id?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
