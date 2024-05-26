import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class CreateRefundDto {
  @ApiProperty()
  notes: string;
  reason: string;
  @IsOptional()
  voucher?: string;

  @IsOptional()
  penalty_nominal?: string;
  @IsOptional()
  date_approve: string;

  date_of_filing: string;

  @IsOptional()
  approval_number: string;

  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  refund_status: number;

  refund_evidences: Express.Multer.File[]
}
