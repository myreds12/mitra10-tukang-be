import { ApiProperty } from '@nestjs/swagger';

export class UpdateDataDto {
  @ApiProperty()
  item_name: string;
  store_id: number;
  category_name: string;
  prices: Prices[];
}
class Prices {
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
