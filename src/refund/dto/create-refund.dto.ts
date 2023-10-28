import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateRefundDto {
  @ApiProperty()
  notes: string;
  reason:string;
  voucher?: string;
  penalty_nominal?: string;
  date_approve: string;
  date_of_filing: string;
  approval_number: string;

  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  refund_status: number;
}
