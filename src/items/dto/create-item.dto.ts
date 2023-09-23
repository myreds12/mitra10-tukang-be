import { ApiProperty } from "@nestjs/swagger"

export class DataDto {
  unit: Unit[]
  price: Prices[]
  items: Items[]
}

class Unit {
  @ApiProperty()
  unit_name: string
}

class Prices {
  @ApiProperty()
  periodic_start: Date
  periodic_end: Date
  nominal_discount: string
  price: number

}

class Items {
  @ApiProperty()
  item_name: string
}