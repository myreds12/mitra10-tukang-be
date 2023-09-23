import { Type } from 'class-transformer';

export class QueryParamsDto {
  @Type(() => Number)
  limit?: number;

  search?: string;

  @Type(() => Number)
  page?: number;

  @Type(() => Number)
  skip?: number;
}
