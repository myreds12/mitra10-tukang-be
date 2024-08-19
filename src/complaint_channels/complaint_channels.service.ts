import { Injectable } from '@nestjs/common';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ComplaintChannelDto } from './dto/complaint_channel.dto';

@Injectable()
export class ComplaintChannelsService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } = query;
    const skip = page * take - take;

    const channels = await this.dbService.complaint_channels.findMany({
      take: take <= 0 ? undefined : take,
      skip,
    });
    
    const sortedChannels = channels.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      return 0;
    });
    return sortedChannels;    
  }

  async create(dto: ComplaintChannelDto, user_id: number){
    const channel = await this.dbService.complaint_channels.create({
      data: {
        ...dto,
        created_by: user_id
      }
    });
    return channel
  }
}
