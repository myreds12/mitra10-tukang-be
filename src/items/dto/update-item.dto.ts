import { ApiProperty } from '@nestjs/swagger';

export class UpdateItemDto {
  @ApiProperty()
  item_name: string;
  store_id: number;
  category_name: string;
  prices: Price[];
}
export class Price {
  @ApiProperty()
  id: number;
  unit_id: number;
  store_id: number;
  periodic_start: Date;
  periodic_end: Date;
  nominal_discount: string;
  price: number;
  created_by: number;
}
