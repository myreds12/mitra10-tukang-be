import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class CityService {
  constructor(private readonly dbService: PrismaService) { }
 
 async findAll(query: QueryParamsDto){
  const { take, page, search,  } = query;
  const skip = page * take - take;
  const countTotal = await this.dbService.city.count();
  const city = await this.dbService.city.findMany({
    skip,
    take: take <= 0 ? undefined : take,
    where: {
      city_name: {
        contains: search ? search : undefined
    }
  }
  })
  return { data: city, countTotal, take, page}
 }
}
