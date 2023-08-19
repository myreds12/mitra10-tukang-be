import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class UpdateEmployeeDto {
    @ApiProperty()
    @IsInt()
    @IsOptional()
    position_id?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    store_id?: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    first_name?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    middle_name?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    last_name?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    email?: string;

    @ApiProperty()
    @IsDate()
    @IsOptional()
    birth?: Date;

    @ApiProperty()
    @IsEnum(['laki - laki', 'perempuan'])
    @IsOptional()
    gender?: string;
    @ApiProperty()
    @IsString()
    @IsOptional()
    nik?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    phone_number?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    whatsapp_number?: string;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    updated_by?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    deleted_by?: number;
}
