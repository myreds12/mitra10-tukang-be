/* eslint-disable prettier/prettier */
import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class DataMasterService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(query: QueryParamsDto) {
    const { take, page, search } = query;
    const skip = page * take - take;
    const city = await this.dbService.data_master.findMany({
      skip,
      take: take <= 0 ? undefined : take,
    });
    console.log(city);
    
    return { data: city, meta: { countTotal: city.length, take, page } };
  }
}
