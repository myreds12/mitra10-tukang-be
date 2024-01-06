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
    const {
      page,
      take,
      search,
      date_from,
      date_to,
      order_by,
      vendor_id,
      monthly,
    } = query;
    const skip = page * take - take;
    const now = new Date();
    if (monthly) now.setFullYear(monthly);
    console.log(
      new Date(now.getFullYear(), 0, 1),
      new Date(now.getFullYear(), 11, 31),
    );
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
        vendor_id
          ? {
              vendor_id: {
                equals: vendor_id,
              },
            }
          : undefined,
        monthly
          ? {
              created_at: {
                gte: new Date(now.getFullYear(), 0, 1),
                lte: new Date(now.getFullYear(), 11, 31),
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
        vendor: {
          include: {
            vendor_bank: {
              include: {
                bank: true,
              },
            },
          },
        },
        status: true,
        invoice_details: {
          include: {
            quotation: {
              include: {
                order: {
                  include: {
                    store: true,
                    members: true,
                  },
                },
                quotation_details: true,
              },
            },
          },
        },
      },
    });
    const count = await this.dbService.invoices.count();
    // const month = invoices.map((x) => ({
    //   january: invoices
    //     .filter((x) => x.created_at.getMonth() === 0)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   february: invoices
    //     .filter((x) => x.created_at.getMonth() === 1)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   march: invoices
    //     .filter((x) => x.created_at.getMonth() === 2)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   april: invoices
    //     .filter((x) => x.created_at.getMonth() === 3)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   may: invoices
    //     .filter((x) => x.created_at.getMonth() === 4)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   june: invoices
    //     .filter((x) => x.created_at.getMonth() === 5)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   july: invoices
    //     .filter((x) => x.created_at.getMonth() === 6)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   august: invoices
    //     .filter((x) => x.created_at.getMonth() === 7)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   september: invoices
    //     .filter((x) => x.created_at.getMonth() === 8)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   october: invoices
    //     .filter((x) => x.created_at.getMonth() === 9)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   november: invoices
    //     .filter((x) => x.created_at.getMonth() === 10)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    //   december: invoices
    //     .filter((x) => x.created_at.getMonth() === 11)
    //     .map((x) => x.invoice_details.length)
    //     .reduce((accumulator, currentValue) => accumulator + currentValue, 0),
    // }));
    const month = invoices.reduce((acc, curr) => {
      const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      const month = curr.created_at.getMonth();
      console.log(month);
      
      const monthName = monthNames[month];

      if (!acc[monthName]) acc[monthName] = 0;

      acc[monthName] += curr.invoice_details.length;
      return acc;
    }, {});

    // return console.log(monthlyData);

    return {
      data: invoices,
      skip,
      page,
      take,
      total: count,
      takeTotal: invoices.length,
      month,
    };
  }

  async findOne(id: number) {
    const invoice = await this.dbService.invoices.findFirst({
      where: {
        id,
      },
      include: {
        invoice_evidence: true,
        vendor: {
          include: {
            vendor_bank: {
              include: {
                bank: true,
              },
            },
          },
        },
        status: true,
        invoice_details: {
          include: {
            quotation: {
              include: {
                order: {
                  include: {
                    members: true,
                  },
                },
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

  async nextCode() {
    const vendor = await this.dbService.vendor.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return vendor[0] || null;
  }
}
