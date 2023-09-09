import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateServiceTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  service_type: string;
}
