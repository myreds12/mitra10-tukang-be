import { Type } from 'class-transformer';

export class QueryParamsDto {
  @Type(() => Number)
  take?: number = 10;

  search?: string;

  @Type(() => Number)
  page?: number = 1;

  @Type(() => Number)
  skip?: number = 0;

  date_from?: string;
  date_to?: string;
  @Type(() => Number)
  status?: number;

  order_by: 'asc' | 'desc' = 'asc';
}
