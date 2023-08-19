import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateVendorAreaDto {
    @ApiProperty()
    @IsInt()
    @IsOptional()
    vendor_id?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    area_serve?: number;

    @ApiProperty()
    @IsDecimal() // Gunakan dekorator @IsDecimal() untuk memastikan nilai adalah desimal
    @IsNotEmpty()
    default_discount: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    default_markup?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    default_unit?: string;

    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    updated_by?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    deleted_by?: number;
}
