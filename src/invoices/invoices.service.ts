import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, invoices, status, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;
      const evidences = invoice_evidences?.length
        ? invoice_evidences.map((item) => {
            return {
              evidence_location: item.filename,
              created_by: user_id,
            };
          })
        : undefined;
      const providedQuotation = createInvoiceDto.invoice_details
        ? createInvoiceDto.invoice_details.map(({ quotation_id }) =>
            Number(quotation_id),
          )
        : undefined;
      const providedOrder = createInvoiceDto.invoice_orders
        ? createInvoiceDto.invoice_orders.map(({ order_id }) =>
            Number(order_id),
          )
        : undefined;

      let quotations;
      let order;
      if (providedQuotation) {
        quotations = await this.dbService.quotation.findMany({
          where: {
            id: {
              in: providedQuotation,
            },
          },
        });
      }
      if (providedOrder) {
        order = await this.dbService.orders.findMany({
          where: {
            id: {
              in: providedOrder,
            },
          },
          include: {
            m_order_details: true,
          },
        });
      }
      console.log(order);

      const totalQuotation = providedQuotation
        ? quotations.reduce((accumulator, currentQuotation) => {
            // Lakukan operasi penambahan grand total di sini, misalnya:
            return accumulator + Number(currentQuotation.quotation_grand_total);
          }, 0)
        : order.reduce((accumulator, currentOrder) => {
            // Lakukan operasi penambahan grand total di sini, misalnya:
            return accumulator + Number(currentOrder.grand_total);
          }, 0);

      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'unpaid',
          },
        },
      });

      const invoicesCount = (await this.dbService.invoices.count()) + 1;

      const invoiceDetails = createInvoiceDto.invoice_details
        ? createInvoiceDto.invoice_details.map((item) => {
            return {
              quotation_id: item.quotation_id,
            };
          })
        : undefined;

      const invoiceOrder = createInvoiceDto.invoice_orders
        ? createInvoiceDto.invoice_orders.map((item) => {
            return {
              order_id: item.order_id,
            };
          })
        : undefined;

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
        total_quotation_grand_total: totalQuotation,
        invoice_evidence: {
          createMany: {
            data: evidences,
          },
        },
        ...(invoiceDetails
          ? {
              invoice_details: {
                createMany: {
                  data: invoiceDetails,
                },
              },
            }
          : undefined),
        ...(invoiceOrder
          ? {
              invoice_orders: {
                createMany: {
                  data: invoiceOrder,
                },
              },
            }
          : undefined),
        created_by: user_id,
      };

      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.create({ data }),
      ]);

      return invoices;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        order_by,
        vendor_id,
        monthly,
        status,
      } = query;
      const skip = page * take - take;
      const now = new Date();
      if (monthly) now.setFullYear(monthly);
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
          ...(status ? [{ status: { id: { in: status } } }] : []),
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
          invoice_orders: {
            include: {
              orders: {
                include: {
                  members: true,
                  store: true,
                },
              },
            },
          },
          invoice_details: {
            include: {
              quotation: {
                include: {
                  order: {
                    include: {
                      m_order_details: {
                        include: {
                          item: true,
                        },
                      },
                      work_orders: {
                        include: {
                          work_order_status: {
                            include: {
                              work_order_items: true,
                            },
                          },
                          work_order_tukang: true,
                        },
                      },
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
      const data = await this.dbService.invoices.findMany({
        include: {
          invoice_details: {
            include: {
              quotation: {
                select: {
                  quotation_grand_total: true,
                },
              },
            },
          },
        },
      });

      const totalQuotationValues = data.reduce((acc, item) => {
        const invoiceDetails = item.invoice_details;

        if (
          invoiceDetails &&
          Array.isArray(invoiceDetails) &&
          invoiceDetails.length > 0
        ) {
          const invoiceTotal = invoiceDetails.reduce(
            (invoiceAcc, i) =>
              invoiceAcc + Number(i.quotation?.quotation_grand_total || 0),
            0,
          );

          return acc + invoiceTotal;
        }

        return acc;
      }, 0);

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

      return {
        data: invoices,
        meta: {
          skip,
          page,
          take,
          total: data.length,
          takeTotal: invoices.length,
          totalQuotationGrandTotal: totalQuotationValues,
          month,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
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
          invoice_orders: {
            include: {
              orders: {
                include: {
                  m_order_details: {
                    include: {
                      item: true,
                    },
                  },
                  work_orders: {
                    include: {
                      work_order_status: {
                        include: {
                          work_order_items: true,
                        },
                      },
                      work_order_tukang: true,
                    },
                  },
                  members: true,
                  store: true,
                },
              },
            },
          },
          invoice_details: {
            include: {
              quotation: {
                include: {
                  order: {
                    include: {
                      members: true,
                      store: true,
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
      const totalQuotationValues = invoice?.invoice_details?.reduce(
        (acc, item) =>
          acc + Number(item?.quotation?.quotation_grand_total || 0),
        0,
      );

      return {
        invoice,
        totalQuotation: totalQuotationValues,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateInvoiceDto: UpdateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id, role_id } = user;
      const invoice = await this.dbService.invoices.findFirstOrThrow({
        where: {
          id,
        },
      });
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
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
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
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatus(invoice: invoices, status_id: number, user: users) {
    try {
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
            statuses.find((x) => x.category.toLowerCase().includes('rejected'))
              .id
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
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async nextCode() {
    const invoices = await this.dbService.invoices.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return invoices[0] || null;
  }

  async updateInvoicesPayment(dto: UpdateInvoiceDto) {
    try {
      const request = {
        where: {
          id: {
            in: dto.invoice_id,
          },
        },
        data: {
          status_id: dto.status_id,
        },
      };
      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.updateMany(request),
      ]);
      return invoices;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
