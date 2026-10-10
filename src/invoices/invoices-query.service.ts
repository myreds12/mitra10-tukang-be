/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesQueryService {
  constructor(private readonly dbService: PrismaService) {}

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
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    invoice_details: {
                      some: {
                        order_id: !isNaN(+search) ? +search : undefined,
                      },
                    },
                  },
                  {
                    invoice_details: {
                      some: {
                        order: {
                          store: {
                            store_name: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(status
            ? [
              {
                status: {
                  in: status,
                },
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
              vendor_id: vendor_id,
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
      const [invoices, total] = await Promise.all([
        this.dbService.invoices.findMany({
          skip,
          take: take <= 0 ? undefined : take,
          where,
          orderBy: {
            created_at: order_by,
          },
          include: {
            vendor: true,
            invoice_details: {
              where: { deleted_at: null },
              select: {
                id: true,
                order_id: true,
                total: true,
                type: true,
                order: {
                  select: {
                    id: true,
                    store_id: true,
                    grand_total: true,
                    members: {
                      select: {
                        id: true,
                        full_name: true,
                        member_number: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        this.dbService.invoices.count({
          where,
        }),
      ]);
      const grandTotalAmount = invoices.reduce(
        (acc, curr) => acc + Number(curr.total_amount),
        0,
      );

      return {
        data: invoices,
        meta: {
          grandTotalAmount,
          skip,
          page,
          take,
          total,
          takeTotal: invoices.length,
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
            include: { bank: true }
          },
          invoice_details: {
            include: {
              order: {
                include: {
                  m_order_details: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      item: true,
                    },
                  },
                  quotation: {
                    where: {
                      deleted_at: null
                    },
                    include: {
                      quotation_receipt: {
                        where: {
                          deleted_at: null
                        }
                      }
                    }
                  },
                  members: true,
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



  async invoiceLogs(invoice_id: number, data: any) {
    await this.dbService.invoice_logs.create({
      data: {
        invoice: {
          connect: {
            id: invoice_id,
          },
        },
        data: JSON.stringify(data ?? {}),
      },
    });
  }



  async getOrderInvoice(queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        payment_type,
        store_id,
        vendor_id,
        work_order_status,
        offset
      } = queryParams;

      const skip = offset > 0 ? offset : page * take - take;
      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  { id: !isNaN(+search) ? +search : undefined },
                  { members: { full_name: { contains: search } } },
                  { store: { store_name: { contains: search } } },
                  { project_number: { contains: search } },
                  { vendor: { company_name: { contains: search } } },
                  { members: { phone_number: { contains: search } } },
                  { members: { whatsapp_number: { contains: search } } },
                ],
              },
            ]
            : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(work_order_status
            ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
            : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          ...(store_id ? [{ store_id: { in: store_id } }] : []),
          ...(vendor_id ? [{ vendor: { id: vendor_id, deleted_at: null } }] : []),
          ...(date_from && date_to
            ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              },
            ]
            : []),
        ].filter(Boolean),
        order_history: {
          some: {
            status: {
              category: {
                in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
              },
            },
          },
        },
        deleted_at: null,
      };

      const data = await this.dbService.orders.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          store: true,
          quotation: true, // Mengambil quotation_grand_total
          order_history: {
            where: {
              status: {
                category: {
                  in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
                },
              },
            },
            include: {
              status: true
            },
            orderBy: { created_at: 'desc' }, // Ambil yang terbaru
          },
        },
      });

      // Mapping hasil sesuai permintaan
      const formattedData = data.flatMap(order => {
        const quoteInHistory = order.order_history.find(h => h.status.category === 'QUOTEIN');
        const workEndHistory = order.order_history.find(h =>
          ['WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'].includes(h.status.category)
        );

        const results = [];

        const getOrderType = (status: string): number => ({
          QUOTEIN: 1,
          WORKEND: 2,
          REWORKEND: 2,
          WORKENDSTEPONE: 3,
          WORKENDSTEPTWO: 4,
          WORKENDSTEPTHREE: 5
        }[status] || 0);

        const getGrandTotal = (orderType: number): number => {
          const total = Number(order.quotation[0]?.quotation_grand_total || 0);
          return orderType === 1 ? Number(order.grand_total)
            : orderType === 3 || orderType === 5 ? total / 4
              : orderType === 4 ? total / 2
                : total;
        };

        if (quoteInHistory) {
          const orderType = getOrderType(quoteInHistory.status.category);
          results.push({
            order_id: order.id,
            store_name: order.store.store_name,
            date_order: order.created_at,
            order_type: orderType,
            order_status: quoteInHistory.status.category,
            order_status_label: quoteInHistory.status.description,
            grand_total: getGrandTotal(orderType),
          });
        }

        if (workEndHistory) {
          const orderType = getOrderType(workEndHistory.status.category);
          results.push({
            order_id: order.id,
            store_name: order.store.store_name,
            date_order: order.created_at,
            order_type: orderType,
            order_status: workEndHistory.status.category,
            order_status_label: workEndHistory.status.description,
            grand_total: getGrandTotal(orderType),
          });
        }

        return results;
      });

      // ✅ Pagination mengikuti jumlah final dari `formattedData`
      const totalResults = formattedData.length; // Hitung total berdasarkan hasil akhir

      // Implementasi pagination yang sesuai dengan frontend
      const paginatedData = formattedData.slice(skip, skip + take);

      return {
        data: paginatedData,
        meta: {
          skip,
          offset,
          page,
          take,
          total: totalResults,
          takeTotal: paginatedData.length,
        },
      };


    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  // async getOrderInvoice(queryParams: QueryParamsDto) {
  //   try {
  //     const {
  //       take,
  //       page,
  //       search,
  //       status,
  //       date_from,
  //       date_to,
  //       order_by,
  //       payment_type,
  //       store_id,
  //       vendor_id,
  //       work_order_status,
  //       offset
  //     } = queryParams;

  //     const skip = offset > 0 ? offset : page * take - take;
  //     const where: Prisma.ordersWhereInput = {
  //       AND: [
  //         ...(search
  //           ? [
  //             {
  //               OR: [
  //                 { receipt_number: { contains: search } },
  //                 { id: !isNaN(+search) ? +search : undefined },
  //                 { members: { full_name: { contains: search } } },
  //                 { store: { store_name: { contains: search } } },
  //                 { project_number: { contains: search } },
  //                 { vendor: { company_name: { contains: search } } },
  //                 { members: { phone_number: { contains: search } } },
  //                 { members: { whatsapp_number: { contains: search } } },
  //               ],
  //             },
  //           ]
  //           : []),
  //         ...(status ? [{ status: { id: { in: status } } }] : []),
  //         ...(work_order_status
  //           ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
  //           : []),
  //         ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
  //         ...(store_id ? [{ store_id: { in: store_id } }] : []),
  //         ...(vendor_id ? [{ vendor: { id: vendor_id, deleted_at: null } }] : []),
  //         ...(date_from && date_to
  //           ? [
  //             {
  //               created_at: {
  //                 gte: new Date(date_from),
  //                 lte: new Date(`${date_to}T23:59:59.000Z`),
  //               },
  //             },
  //           ]
  //           : []),
  //       ].filter(Boolean),
  //       order_history: {
  //         some: {
  //           status: {
  //             category: {
  //               in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
  //             },
  //           },
  //         },
  //       },
  //       deleted_at: null,
  //     };

  //     const data = await this.dbService.orders.findMany({
  //       skip,
  //       take: take > 0 ? take : undefined,
  //       where,
  //       orderBy: {
  //         created_at: order_by,
  //       },
  //       include: {
  //         store: true,
  //         quotation: true, // Mengambil quotation_grand_total
  //         order_history: {
  //           where: {
  //             status: {
  //               category: {
  //                 in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
  //               },
  //             },
  //           },
  //           include: {
  //             status: true
  //           },
  //           orderBy: { created_at: 'desc' }, // Ambil yang terbaru
  //         },
  //       },
  //     });

  //     // Mapping hasil sesuai permintaan
  //     const formattedData = data.flatMap(order => {
  //       const quoteInHistory = order.order_history.find(h => h.status.category === 'QUOTEIN');
  //       const workEndHistory = order.order_history.find(h =>
  //         ['WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'].includes(h.status.category)
  //       );

  //       const results = [];

  //       const getOrderType = (status: string): number => ({
  //         QUOTEIN: 1,
  //         WORKEND: 2,
  //         REWORKEND: 2,
  //         WORKENDSTEPONE: 3,
  //         WORKENDSTEPTWO: 4,
  //         WORKENDSTEPTHREE: 5
  //       }[status] || 0);

  //       const getGrandTotal = (orderType: number): number => {
  //         const total = Number(order.quotation[0]?.quotation_grand_total || 0);
  //         return orderType === 1 ? Number(order.grand_total)
  //           : orderType === 3 || orderType === 5 ? total / 4
  //             : orderType === 4 ? total / 2
  //               : total;
  //       };

  //       if (quoteInHistory) {
  //         const orderType = getOrderType(quoteInHistory.status.category);
  //         results.push({
  //           order_id: order.id,
  //           store_name: order.store.store_name,
  //           date_order: order.created_at,
  //           order_type: orderType,
  //           order_status: quoteInHistory.status.category,
  //           order_status_label: quoteInHistory.status.description,
  //           grand_total: getGrandTotal(orderType),
  //         });
  //       }

  //       if (workEndHistory) {
  //         const orderType = getOrderType(workEndHistory.status.category);
  //         results.push({
  //           order_id: order.id,
  //           store_name: order.store.store_name,
  //           date_order: order.created_at,
  //           order_type: orderType,
  //           order_status: workEndHistory.status.category,
  //           order_status_label: workEndHistory.status.description,
  //           grand_total: getGrandTotal(orderType),
  //         });
  //       }

  //       return results;
  //     });

  //     // ✅ Pagination mengikuti jumlah final dari `formattedData`
  //     const totalResults = formattedData.length; // Hitung total berdasarkan hasil akhir

  //     // Implementasi pagination yang sesuai dengan frontend
  //     const paginatedData = formattedData.slice(skip, skip + take);

  //     return {
  //       data: paginatedData,
  //       meta: {
  //         skip,
  //         offset,
  //         page,
  //         take,
  //         total: totalResults,
  //         takeTotal: paginatedData.length,
  //       },
  //     };


  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }


}
