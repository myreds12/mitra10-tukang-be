import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePositionDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    position_name: string;

    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    created_by?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    updated_by?: number;

    @ApiProperty()
    @IsInt()
    @IsOptional()
    deleted_by?: number;
}


