import { Injectable } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createInvoiceDto: CreateInvoiceDto, user: users) {
    const { id: user_id } = user
    const invoice = await this.dbService.invoices.create({
      data: {
        order: {
          connect: {
            id: createInvoiceDto.order_id
          }
        },
        request_work_time: new Date(createInvoiceDto.request_work_time),
        survey_date: new Date(createInvoiceDto.survey_date),
        work_start_date: new Date(createInvoiceDto.work_start_date),
        work_end_date: new Date(createInvoiceDto.work_end_date),
        created_by: user_id
      }
    })

    return invoice;
  }

  async findAll(query: QueryParamsDto) {
    const { search, skip, take } = query
    const invoice = await this.dbService.invoices.findMany({
      take: take,
      skip: skip,
      where: {
        survey_date: {
          lte: new Date(search) ?? null
        }
      }
    })

    return invoice;
  }

  async findOne(id: number) {
    const invoice = await this.dbService.invoices.findFirst({
      where: {
        id
      }
    })

    return invoice
  }

  async update(id: number, updateInvoiceDto: UpdateInvoiceDto, user: users) {
    const { id: user_id } = user;
    const invoice = await this.dbService.invoices.update({
      where: {
        id
      },
      data: {
        order: {
          connect: {
            id: updateInvoiceDto.order_id
          }
        },
        request_work_time: new Date(updateInvoiceDto.request_work_time),
        survey_date: new Date(updateInvoiceDto.survey_date),
        work_start_date: new Date(updateInvoiceDto.work_start_date),
        work_end_date: new Date(updateInvoiceDto.work_end_date),
        updated_by: user_id,
        updated_at: new Date()
      }
    })

    return invoice;
  }

  async remove(id: number, user: users) {
    const { id: user_id } = user;
    const invoice = await this.dbService.invoices.update({
      where: {
        id
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id
      }
    })

    return invoice;
  }
}
