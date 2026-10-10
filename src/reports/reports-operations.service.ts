/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class ReportsOperationsService {
  private readonly logger = new Logger(ReportsOperationsService.name);

  constructor(private readonly dbService: PrismaService) {}

async reportComplaint(query: QueryParamsDto) {
    try {
      const {
        search,
        status,
        date_from,
        date_to,
        order_by,
        store_id,
        vendor_id,
        tukang_id,
      } = query;

      const statusCategories = {
        totalComplaintInvestigated: ['INVESTIGATED'],
        totalComplaintApprovedByHo: ['COMPLAINTAPPROVEDBYHO'],
        totalComplaintRejectedByHo: ['COMPLAINTREJECTEDBYHO'],
        totalResurvey: ['RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE'],
        totalRework: ['REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalSolved: ['SOLVED'],
        totalUnsolved: ['UNSOLVED'],
      };

      const summaryTemplate = {
        totalComplaint: 0,
        totalComplaintInvestigated: 0,
        totalComplaintApprovedByHo: 0,
        totalComplaintRejectedByHo: 0,
        totalResurvey: 0,
        totalRework: 0,
        totalSolved: 0,
        totalUnsolved: 0,
      };

      const isSameDay = date_from === date_to;
      const isSameMonth =
        new Date(date_from).getMonth() === new Date(date_to).getMonth() &&
        new Date(date_from).getFullYear() === new Date(date_to).getFullYear();
      const allDaysInMonth = Array.from(
        {
          length: new Date(
            new Date(date_from).getFullYear(),
            new Date(date_from).getMonth() + 1,
            0,
          ).getDate(),
        },
        (_, i) => (i + 1).toString().padStart(2, '0'),
      );
      const periods = isSameDay
        ? Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
        : isSameMonth
        ? allDaysInMonth
        : Array.from({ length: 12 }, (_, i) =>
            new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
          );

      const summary = periods.reduce((acc, period) => {
        acc[period] = { ...summaryTemplate };
        return acc;
      }, {});

      const where: Prisma.complaintsWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : undefined,
          search
            ? {
                OR: [
                  !isNaN(Number(search))
                    ? {
                        id: {
                          equals: Number(search),
                        },
                      }
                    : undefined,
                  !isNaN(Number(search))
                    ? {
                        order_id: Number(search),
                      }
                    : undefined,
                  {
                    complaint_channels: {
                      name: { contains: search },
                    },
                  },
                  {
                    orders: {
                      members: {
                        whatsapp_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      members: {
                        phone_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      members: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      store: {
                        store_name: search,
                      },
                    },
                  },
                  {
                    orders: {
                      sales: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                ],
              }
            : undefined,
          store_id
            ? {
                orders: {
                  store_id: {
                    in: store_id,
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                orders: {
                  vendor_id: {
                    equals: vendor_id,
                  },
                },
              }
            : undefined,
          tukang_id
            ? {
                orders: {
                  work_orders: {
                    work_order_tukang: {
                      some: {
                        tukang_id: tukang_id,
                      },
                    },
                  },
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
      };

      const complaints = await this.dbService.complaints.findMany({
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          status: true,
          orders: {
            include: {
              status: true,
            },
          },
        },
      });

      complaints.forEach((complaint) => {
        const complaintWib = new Date(
          new Date(complaint.created_at).getTime() + 7 * 60 * 60 * 1000,
        );

        const period = isSameDay
          ? complaintWib.toLocaleString('id-ID', {
              hour: '2-digit',
              hour12: false,
            })
          : isSameMonth
          ? complaintWib.toLocaleString('id-ID', {
              day: '2-digit',
            })
          : complaintWib.toLocaleString('id-ID', {
              month: 'long',
            });

        if (summary[period]) {
          const { category } = complaint.status;

          if (statusCategories.totalComplaintInvestigated.includes(category)) {
            summary[period].totalComplaintInvestigated++;
          }

          if (statusCategories.totalComplaintApprovedByHo.includes(category)) {
            summary[period].totalComplaintApprovedByHo++;
          }

          if (statusCategories.totalComplaintRejectedByHo.includes(category)) {
            summary[period].totalComplaintRejectedByHo++;
          }

          if (
            statusCategories.totalResurvey.includes(
              complaint.orders.status.category,
            )
          ) {
            summary[period].totalResurvey++;
          }

          if (
            statusCategories.totalRework.includes(
              complaint.orders.status.category,
            )
          ) {
            summary[period].totalRework++;
          }

          if (category === 'SOLVED') {
            summary[period].totalSolved++;
          }

          if (category === 'UNSOLVED') {
            summary[period].totalUnsolved++;
          }
        }
      });

      // Ensure all periods are accounted for
      periods.forEach((period) => {
        if (!summary[period]) {
          summary[period] = { ...summaryTemplate };
        }
      });

      // Prepare report data
      const reportData = periods.map((period) => ({
        period,
        ...summary[period],
      }));

      // Aggregate counts and totals
      const count = await this.dbService.complaints.count({ where });

      // Return final report
      return {
        data: reportData,
        meta: {
          total: count,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

async reportTukang(query: QueryParamsDto) {
    try {
      const {
        date_from,
        vendor_id,
        date_to,
        page,
        search,
        take,
        search_date_from,
        search_date_to,
        service_types,
        area_id,
      } = query;
      const skip = page * take - take;

      const where: Prisma.tukangWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    {
                      tukang_area: {
                        some: {
                          area: {
                            area: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                    { address: { contains: search } },
                    { email: { contains: search } },
                    { phone_number: { contains: search } },
                    { full_name: { contains: search } },
                    { ktp_number: { contains: search } },
                    {
                      full_name: {
                        contains: search,
                      },
                    },
                    { vendor: { company_name: { contains: search } } },
                    {
                      tukang_service: {
                        some: {
                          service_type: { service_type: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          service_types
            ? {
                tukang_service: {
                  some: {
                    service_type_id: {
                      in: service_types,
                    },
                  },
                },
              }
            : undefined,
          area_id
            ? {
                tukang_area: {
                  some: {
                    area_id: {
                      in: area_id,
                    },
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                vendor_id: vendor_id,
              }
            : undefined,
          search_date_from && search_date_to
            ? {
                join_date: {
                  gte: new Date(`${search_date_from}T00:00:00.000Z`),
                  lte: new Date(`${search_date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(`${date_from}T00:00:00.000Z`),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
        ],
        deleted_at: null,
      };
      const tukang = await this.dbService.tukang.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        include: {
          work_order_tukang: {
            where: { deleted_at: null },
            include: {
              work_orders: {
                include: {
                  order: {
                    include: {
                      quotation: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const tukangInvoiceSummary = await Promise.all(
        tukang.map(async (tukangItem) => {
          const totalInvoices = await this.dbService.invoices.aggregate({
            where: {
              invoice_details: {
                some: {
                  order: {
                    work_orders: {
                      work_order_tukang: {
                        some: {
                          tukang_id: tukangItem.id,
                        },
                      },
                    },
                  },
                },
              },
            },
            _sum: {
              total_amount: true,
            },
          });

          const totalQuotations = await this.dbService.quotation.aggregate({
            where: {
              order: {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukangItem.id,
                    },
                  },
                },
              },
            },
            _sum: {
              quotation_grand_total: true,
            },
          });

          return {
            tukang: tukangItem,
            totalInvoices: totalInvoices._sum?.total_amount || 0,
            totalQuotations: totalQuotations._sum?.quotation_grand_total || 0,
          };
        }),
      );

      return tukangInvoiceSummary;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

async reportVendor() {
    try {
      const vendors = await this.dbService.vendor.findMany({
        include: {
          orders: {
            include: {
              m_order_details: true,
            },
          },
        },
      });

      const vendorsSummary = vendors.map((vendor) => {
        const totalOrders = vendor.orders.length;
        const totalGrandTotal = vendor.orders.reduce((acc, order) => {
          return acc + Number(order.grand_total);
        }, 0);

        return {
          vendor,
          totalOrders: totalOrders,
          totalGrandTotal: totalGrandTotal,
        };
      });

      return vendorsSummary;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
