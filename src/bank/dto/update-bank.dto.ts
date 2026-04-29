import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateBankDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bank_name: string;
}
