import { Injectable } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService) { }
  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;
    const evidences = invoice_evidences
      ? invoice_evidences.map((item) => {
        return {
          evidence_location: item.filename,
          created_by: user_id,
        };
      })
      : undefined;

    const data: Prisma.invoicesCreateInput = {
      order: {
        connect: {
          id: createInvoiceDto.order_id,
        },
      },
      request_work_time: new Date(createInvoiceDto.request_work_time),
      survey_date: new Date(createInvoiceDto.survey_date),
      work_start_date: new Date(createInvoiceDto.work_start_date),
      work_end_date: new Date(createInvoiceDto.work_end_date),
      invoice_evidence: {
        createMany: {
          data: evidences,
        },
      },
      created_by: user_id,
    };

    const [invoices] = await this.dbService.$transaction([
      this.dbService.invoices.create({ data }),
    ]);

    return invoices;
  }

  async findAll(query: QueryParamsDto) {
    const { page, take, search, date_from, date_to, order_by } = query;
    const skip = page * take - take;
    const where: Prisma.invoicesWhereInput = {
      AND: [
        ...(search
          ? [
            {
              OR: [
                { request_work_time: { equals: new Date(search) } },
                { survey_date: { equals: new Date(search) } },
                { work_start_date: { equals: new Date(search) } },
                { work_end_date: { equals: new Date(search) } },
              ],
            },
          ]
          : []),
        date_from && date_to
          ? {
            created_at: {
              gte: new Date(`${date_from}T00:00:00.000Z`),
              lte: new Date(`${date_to}T23:59:59.000Z`),
            },
          }
          : undefined,
      ].filter(Boolean),
      deleted_at: null,
    };
    const invoices = await this.dbService.invoices.findMany({
      skip,
      take: take <= 0 ? undefined : take,
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        invoice_evidence: true,
        order: {
          include: {
            complaints: true,
            m_order_details: true,
            status: true,
            quotation: true,
            work_orders: {
              include: {
                work_order_status: {
                  include: {
                    status: true,
                  },
                },
                work_order_evidences: true,
                work_order_tukang: {
                  include: {
                    tukang: true,
                  },
                },
              },
            },
            vendor: true,
          },
        },
      },
    });

    return { data: invoices, skip, page, take, total: invoices.length };
  }

  async findOne(id: number) {
    const invoice = await this.dbService.invoices.findFirst({
      where: {
        id,
      },
      include: {
        order: {
          include: {
            complaints: true,
            m_order_details: true,
            status: true,
            quotation: true,
            work_orders: {
              include: {
                work_order_status: {
                  include: {
                    status: true,
                  },
                },
                work_order_evidences: true,
                work_order_tukang: {
                  include: {
                    tukang: true,
                  },
                },
              },
            },
            vendor: true,
          },
        },
      },
    });

    return invoice;
  }

  //FIXME : TOLONG CEK APAKAH SUDAH SESUAI ATAU BELUM
  async update(
    id: number,
    updateInvoiceDto: UpdateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;
    const evidences = invoice_evidences
      ? invoice_evidences.map((item) => {
        return {
          evidence_location: item.filename,
          created_by: user_id,
        };
      })
      : undefined;

    const invoice_data: Prisma.invoicesUpdateInput = {
      order: {
        connect: {
          id: updateInvoiceDto.order_id,
        },
      },
      request_work_time: new Date(updateInvoiceDto.request_work_time),
      survey_date: new Date(updateInvoiceDto.survey_date),
      work_start_date: new Date(updateInvoiceDto.work_start_date),
      work_end_date: new Date(updateInvoiceDto.work_end_date),
      updated_at: new Date(),
      updated_by: user_id,
    };

    const invoice: Prisma.invoicesUpdateArgs = {
      where: {
        id,
      },
      data: {
        ...invoice_data,
        ...(invoice_evidences
          ? {
            invoice_evidence: {
              createMany: {
                data: evidences,
              },
            },
          }
          : undefined),
      },
    };

    const [invoice_evidence, invoices] = await this.dbService.$transaction([
      this.dbService.invoice_evidence.updateMany({
        where: {
          invoice_id: id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id
        }
      }),
      this.dbService.invoices.update(invoice),
    ]);

    return invoices;
  }

  async remove(id: number, user: users) {
    const { id: user_id } = user;
    const invoice = await this.dbService.invoices.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });

    return invoice;
  }
}
