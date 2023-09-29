import { Injectable } from '@nestjs/common';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class ComplaintsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createComplaintDto: CreateComplaintDto, user_id: number) {
    const complaint = await this.dbService.complaints.create({
      data: {
        orders: {
          connect: {
            id: createComplaintDto.order_id
          }
        },
        description: createComplaintDto.description,
        complaint_channel: createComplaintDto.complaint_channel,
        complaint_date: new Date(createComplaintDto.complaint_date),
        complaint_status: createComplaintDto.complaint_status,
        created_by: user_id
      }
    })
    return complaint
  }

  async findAll(query: QueryParamsDto) {
    const { limit, skip, search, status } = query;
    const complaint = await this.dbService.complaints.findMany({
      skip: skip,
      take: limit,
      where: {
        complaint_channel: {
          contains: search ?? null
        }
      }
    })

    return complaint
  }

  async findOne(id: number) {
    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id
      }
    })

    return complaint
  }

  async update(id: number, updateComplaintDto: UpdateComplaintDto, user_id: number) {
    const complaint = await this.dbService.complaints.update({
      where: {
        id
      },
      data: {
        order_id: updateComplaintDto.order_id,
        description: updateComplaintDto.description,
        complaint_channel: updateComplaintDto.complaint_channel,
        complaint_date: new Date(updateComplaintDto.complaint_date),
        complaint_status: updateComplaintDto.complaint_status,
        updated_at: new Date(),
        updated_by: user_id
      }
    })

    return complaint
  }

  async remove(id: number, user_id: number) {
    const complaint = await this.dbService.complaints.update({
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
