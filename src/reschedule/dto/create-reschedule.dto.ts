import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';
import { RescheduleStatusDto } from './reschedule-status.dto';

export class CreateRescheduleDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  order_id: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  status_id: number;

  @IsNotEmpty()
  reschedule_date: string;

  @Type(() => RescheduleStatusDto)
  reschedule_status: RescheduleStatusDto;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  @ValidateNested({ each: true })
  reschedule_evidences: Express.Multer.File[];
}
