import { ApiProperty } from '@nestjs/swagger';

export class DataDto {
  @ApiProperty()
  item_name: string;
  category_name: string;
  prices: Prices[];
}
class Prices {
  @ApiProperty()
  unit_id: number;
  store_id: number;
  periodic_start: string;
  periodic_end: string;
  nominal_discount: string;
  price: number;
  created_by?: number;
}
