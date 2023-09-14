import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateItemDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  store_id: number;

  @ApiProperty()
  @IsString()
  @IsString()
  item_name: string;

  @ApiProperty()
  @IsString()
  @IsString()
  price: string;

  @ApiProperty()
  @IsString()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsString()
  @IsString()
  discount: string;
}
