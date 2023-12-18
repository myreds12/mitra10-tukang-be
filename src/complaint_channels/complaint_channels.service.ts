import { Injectable } from '@nestjs/common';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ComplaintChannelsService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } = query;
    const skip = page * take - take;

    const channels = await this.dbService.complaint_channels.findMany({
      take: take <= 0 ? undefined : take,
      skip,
      orderBy: {
        created_at: order_by,
      },
    });

    return channels;
  }
}
