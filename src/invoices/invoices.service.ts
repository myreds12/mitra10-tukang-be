import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, invoices, status, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { MulterError } from 'multer';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService) {}
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

    const providedQuotation = createInvoiceDto.invoice_details.map(
      ({ quotation_id }) => quotation_id,
    );
    const quotations = await this.dbService.quotation.findMany({
      where: {
        id: {
          in: providedQuotation,
        },
      },
    });

    const checkQuotation = providedQuotation.filter(
      (i) => !quotations.some((y) => y.id === i),
    );

    if (checkQuotation.length)
      throw new NotFoundException({
        messages: 'The provided quotation id not found',
        errorIds: checkQuotation,
      });

    const status = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'unpaid',
        },
      },
    });

    const invoicesCount = (await this.dbService.invoices.count()) + 1;

    const invoiceDetails: Prisma.invoice_detailsCreateManyInvoicesInput[] =
      createInvoiceDto.invoice_details.map((item) => {
        return {
          quotation_id: item.quotation_id,
        };
      });

    const data: Prisma.invoicesCreateInput = {
      vendor: {
        connect: {
          id: createInvoiceDto.vendor_id,
        },
      },
      status: {
        connect: {
          id: status.id,
        },
      },
      invoice_number: `${invoicesCount}`,
      invoice_evidence: {
        createMany: {
          data: evidences,
        },
      },
      invoice_details: {
        createMany: {
          data: invoiceDetails,
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
                  {
                    invoice_number: { contains: search },
                  },
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
        vendor: true,
        status: true,
        invoice_details: {
          include: {
            quotation: {
              include: {
                order: true,
                quotation_details: true,
              },
            },
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
        invoice_evidence: true,
        vendor: true,
        status: true,
        invoice_details: {
          include: {
            quotation: {
              include: {
                order: true,
                quotation_details: true,
              },
            },
          },
        },
      },
      // include: {
      //   order: {
      //     include: {
      //       complaints: true,
      //       m_order_details: true,
      //       status: true,
      //       quotation: true,
      //       work_orders: {
      //         include: {
      //           work_order_status: {
      //             include: {
      //               status: true,
      //             },
      //           },
      //           work_order_evidences: true,
      //           work_order_tukang: {
      //             include: {
      //               tukang: true,
      //             },
      //           },
      //         },
      //       },
      //       vendor: true,
      //     },
      //   },
      // },
    });

    return invoice;
  }

  //FIXME : FILE SYNC STILL DELETING ALL DATA
  async update(
    invoice: invoices,
    updateInvoiceDto: UpdateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    const { id: user_id, role_id } = user;
    const evidences = invoice_evidences
      ? {
          invoice_evidence: {
            createMany: {
              data: invoice_evidences.map((item) => {
                return {
                  evidence_location: item.filename,
                  created_by: user_id,
                };
              }),
            },
          },
        }
      : undefined;

    const invoiceDetails: Prisma.invoice_detailsUpsertWithWhereUniqueWithoutInvoicesInput[] =
      updateInvoiceDto.invoice_details.map((item) => {
        return {
          where: {
            id: invoice.id,
          },
          create: {
            quotation: {
              connect: {
                id: item.quotation_id,
              },
            },
            created_by: user_id,
          },
          update: {
            quotation_id: item.quotation_id,
            updated_at: new Date(),
            updated_by: user_id,
          },
        };
      });

    const invoice_data: Prisma.invoicesUpdateInput = {
      updated_at: new Date(),
      updated_by: user_id,
      invoice_details: {
        upsert: invoiceDetails,
      },
      ...evidences,
    };

    const invoice_args: Prisma.invoicesUpdateArgs = {
      where: {
        id: invoice.id,
      },
      data: invoice_data,
    };

    const [syncFiles, syncDetails, invoices] =
      await this.dbService.$transaction([
        this.dbService.invoice_evidence.updateMany({
          where: {
            invoice_id: invoice.id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.invoice_details.updateMany({
          where: {
            id: {
              in: updateInvoiceDto.invoice_details
                .filter((x) => Boolean(x?.id))
                .map((item) => item?.id),
            },
            invoice_id: invoice.id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.invoices.update(invoice_args),
      ]);
    await this.setStatus(
      invoices,
      updateInvoiceDto?.status_id ?? invoices.status_id,
      user,
    );

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

  async setStatus(invoice: invoices, status_id: number, user: users) {
    const statuses = await this.dbService.status.findMany();
    let newStatus = statuses.find((i) =>
      i.category.toLowerCase().includes('unpaid'),
    );

    const role = await this.dbService.roles.findFirst({
      where: {
        id: user.role_id,
      },
    });

    if (role.name.toLowerCase() === 'admin ho') {
      newStatus = statuses.find((i) =>
        i.category.toLowerCase().includes('pending'),
      );

      if (
        invoice.status_id ===
          statuses.find((x) => x.category.toLowerCase().includes('pending'))
            .id &&
        status_id ===
          statuses.find((x) => x.category.toLowerCase().includes('paid')).id
      ) {
        newStatus = statuses.find((i) =>
          i.category.toLowerCase().includes('paid'),
        );
      }

      if (
        invoice.status_id ===
          statuses.find((x) => x.category.toLowerCase().includes('pending'))
            .id &&
        status_id ===
          statuses.find((x) => x.category.toLowerCase().includes('rejected')).id
      ) {
        newStatus = statuses.find((i) =>
          i.category.toLowerCase().includes('rejected'),
        );
      }
    }

    await this.dbService.invoices.update({
      where: {
        id: invoice.id,
      },
      data: {
        status: {
          connect: {
            id: newStatus.id,
          },
        },
      },
    });
  }
}
