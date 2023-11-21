import { Transform, Type } from 'class-transformer';

export class QueryParamsDto {
  @Type(() => Number)
  take?: number = 10;

  search?: string;

  @Type(() => Number)
  page?: number = 1;

  @Type(() => Number)
  skip?: number = 0;

  @Transform((value) => value.value.split(',').map(Number))
  @Type(() => String)
  status?: number[];

  date_from?: string;
  date_to?: string;

  group_by?: string;

  order_by: 'asc' | 'desc' = 'asc';
}
