import { Type } from 'class-transformer';

export class QueryParamsDto {
  @Type(() => Number)
  limit?: number;

  search?: string;

  @Type(() => Number)
  page?: number;

  @Type(() => Number)
  skip?: number;

  date_from?: string;
  date_to?: string;
  status?: string;
}
