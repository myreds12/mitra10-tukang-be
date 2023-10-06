import { Injectable } from '@nestjs/common';
import { CreateComplaintChannelDto } from './dto/create-complaint_channel.dto';
import { UpdateComplaintChannelDto } from './dto/update-complaint_channel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class ComplaintChannelService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createComplaintChannelDto: CreateComplaintChannelDto, user_id: number) {
    const complaint_channel = await this.dbService.complaint_channels.create({
      data: {
        ...createComplaintChannelDto,
        created_by: user_id
      }
    })

    return complaint_channel
  }

  async findAll(query: QueryParamsDto) {
    const { search } = query;
    const complaint_channel = await this.dbService.complaint_channels.findMany({
      where: {
        name: {
          contains: search || undefined
        }
      }
    })
  }

  async findOne(id: number) {
    const complaint_channel = await this.dbService.complaint_channels.findFirst({
      where: {
        id
      }
    })
    return complaint_channel
  }

  async update(id: number, updateComplaintChannelDto: UpdateComplaintChannelDto, user_id: number) {
    const complaint_channels = await this.dbService.complaint_channels.update({
      where: {
        id
      },
      data: {
        ...updateComplaintChannelDto,
        updated_at: new Date(),
        updated_by: user_id
      }
    })
  }

  async remove(id: number, user_id: number) {
    const complaint_channels = await this.dbService.complaint_channels.update({
      where: {
        id
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id
      }
    })
  }
}
