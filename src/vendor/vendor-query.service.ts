/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class VendorQueryService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(query: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        date_from,
        date_to,
        store_id,
        vendor_with_max_order,
        top_best,
        order_date_from,
        order_date_to,
        is_paid,
        is_promotion,
        id_vendor,
        is_active,
      } = query;

      const formattedDate = new Date().toISOString().split('T')[0];
      const requestedTake = Number(take ?? 10);
      const safeTake = requestedTake > 0 ? Math.min(requestedTake, 50) : undefined;
      const skip = safeTake ? page * safeTake - safeTake : 0;
      const currentDateRange = {
        gte: new Date(`${formattedDate}T00:00:00.000Z`),
        lte: new Date(`${formattedDate}T23:59:59.000Z`),
      };

      const where: Prisma.vendorWhereInput = {
        AND: [
          ...(search
            ? [{
              OR: [
                { id: !isNaN(+search) ? +search : undefined },
                { phone_number: { contains: search } },
                { email_address: { contains: search } },
                { company_name: { contains: search } },
                { pic_name: { contains: search } },
              ]
            }]
            : []),
          ...(store_id
            ? [{ vendor_store: { some: { store_id: { in: store_id }, deleted_at: null } } }]
            : []),
               ...(id_vendor && !isNaN(+id_vendor)
            ? [{ id: +id_vendor }]
            : []),
          ...(date_from && date_to
            ? [{ created_at: { gte: new Date(date_from), lte: new Date(`${date_to}T23:59:59.000Z`) } }]
            : []),
          ...(is_active === 0 || is_active === 1
            ? [{ is_active: Boolean(is_active) }]
            : []),
          ...(order_date_from && order_date_to ? [{
            orders: {
              some: {
                deleted_at: null,
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`)
                }
              }
            }
          }] : []),
          ...(is_paid === 1 ? [{
            orders: {
              some: {
                deleted_at: null,
                quotation: {
                  some: {
                    deleted_at: null,
                    receipt_quotation: { not: null }
                  }
                }
              }
            }
          }] : is_paid === 0 ? [{
            orders: {
              some: {
                deleted_at: null,
                quotation: {
                  some: {
                    deleted_at: null,
                    receipt_quotation: null
                  }
                }
              }
            }
          }] : []),
        ],
        deleted_at: null
      };

      console.log(where);
      

      const vendorList = await this.dbService.vendor.findMany({
        where,
        skip,
        take: safeTake,
        include: {
          tukang: {
            include: {
              work_order_tukang: {
                where: {
                  deleted_at: null,
                  work_orders: {
                    deleted_at: null,
                    OR: [
                      { created_at: currentDateRange },
                      { survey_date: currentDateRange },
                      { work_start_date: currentDateRange },
                      { work_end_date: currentDateRange },
                    ],
                  },
                },
                orderBy: { created_at: 'desc' },
                include: {
                  work_orders: {
                    include: { status: true }
                  }
                }
              }
            }
          },
          pic_vendor: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                  roles: { select: { id: true, name: true } }
                }
              }
            }
          },
          vendor_area: {
            where: { deleted_at: null },
            include: { area: true }
          },
          bank: true,
          vendor_document: true,
          vendor_service: {
            where: { deleted_at: null },
            include: { service_type: true }
          },
          vendor_store: {
            where: {
              ...(store_id?.length ? { store_id: { in: store_id } } : {}),
              deleted_at: null,
            },
            select: {
              id: true,
              vendor_id: true,
              created_at: true,
              deleted_at: true,
              store: {
                select: {
                  id: true,
                  store_name: true,
                  additional_address: true,
                  address: true,
                  bank_account: true,
                  bank_name: true,
                  bank_number: true,
                  email: true,
                  phone_number_1: true,
                  phone_number_2: true,
                  area_id: true,
                  area: true
                }
              }
            }
          },
          work_orders: {
            where: {
              deleted_at: null,
              OR: [
                {
                  survey_date: {
                    gte: new Date(`${formattedDate}T00:00:00.000Z`),
                    lte: new Date(`${formattedDate}T23:59:59.000Z`)
                  }
                },
                {
                  work_start_date: { gte: new Date(`${formattedDate}T00:00:00.000Z`) },
                  work_end_date: { lte: new Date(`${formattedDate}T23:59:59.000Z`) }
                }
              ]
            }
          }
        }
      });

      let vendor = vendorList;
      if (vendor_with_max_order) {
        vendor = vendorList.filter((v) => {
          return v.tukang.some((t) => {
            const dailySlots = t.work_order_tukang.filter((item) => {
              const {
                work_start_date,
                work_end_date,
                survey_date,
                status,
                created_at,
              } = item?.work_orders || {};

              let startDate: Date;
              let endDate: Date;

              if (work_start_date && work_end_date) {
                startDate = new Date(work_start_date);
                endDate = new Date(work_end_date);
              } else if (survey_date) {
                startDate = new Date(survey_date);
                endDate = startDate;
              } else {
                startDate = new Date(created_at);
                endDate = startDate;
              }

              const currentDate = new Date().toISOString().split('T')[0];

              const isWithinRange =
                startDate.toISOString().split('T')[0] <= currentDate &&
                endDate.toISOString().split('T')[0] >= currentDate;
              return (
                status?.category !== 'SURVEYDONE' &&
                status?.category !== 'WORKEND' &&
                isWithinRange
              );
            });

            return dailySlots.length <= v.max_order;
          });
        });
      }

      vendor = vendorList.map((vendor) => {
        return {
          ...vendor,
          tukang: vendor.tukang.map((tukangItem) => {
            const dailySlots = tukangItem.work_order_tukang.filter((item) => {
              const orderDate = new Date(item.work_orders?.created_at ?? 0)
                .toISOString()
                .split('T')[0];

              return (
                item.work_orders?.status?.category !== 'SURVEYDONE' &&
                item.work_orders?.status?.category !== 'WORKEND' &&
                orderDate === formattedDate
              );
            });

            return {
              ...tukangItem,
              slot_order: dailySlots.length,
            };
          }),
        };
      });


      const vendorIds = vendor.map(v => v.id);

      const [ordersAggregate, unpaidAggregate, paidAggregate, surveyAggregate, workAggregate] = await Promise.all([
        this.dbService.orders.groupBy({
          by: ["vendor_id"],
          where: {
            vendor_id: { in: vendorIds },
            deleted_at: null,
            ...(order_date_from && order_date_to ? {
              created_at: {
                gte: new Date(order_date_from),
                lte: new Date(`${order_date_to}T23:59:59.000Z`)
              }
            } : {}),
            ...(is_promotion === 1 ? { payment_type: "pemasangan_tanpa_survey" } : is_promotion === 2 ? { payment_type: "survey" } :  is_promotion === 3 ? { payment_type: "gratis" } : {} )
          },
          _count: { id: true },
          _sum: { grand_total: true }
        }),
        this.dbService.orders.groupBy({
          by: ["vendor_id"],
          where: {
            vendor_id: { in: vendorIds },
            deleted_at: null,
            ...(order_date_from && order_date_to
              ? {
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`),
                },
              }
              : {}),
            ...(is_promotion === 1
              ? {
                receipt_number: null,
                payment_type: "pemasangan_tanpa_survey",
              }
              : is_promotion === 2
                ? {
                  payment_type: "survey",
                  quotation: {
                    some: {
                      receipt_quotation: null,
                      quotation_receipt: { none: {} },
                    },
                  },
                }
                :  is_promotion === 3 ? {
                  receipt_number: null,
                  payment_type: "gratis",
                } : {}),
          },
          _count: { id: true },
          _sum: { grand_total: true }
        }),
        this.dbService.orders.groupBy({
          by: ["vendor_id"],
          where: {
            vendor_id: { in: vendorIds },
            deleted_at: null,
            ...(order_date_from && order_date_to
              ? {
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`),
                },
              }
              : {}),
            ...(is_promotion === 1
              ? {
                receipt_number: null,
                payment_type: "pemasangan_tanpa_survey",
              }
              : is_promotion === 0
                ? {
                  payment_type: "survey",
                  quotation: {
                    some: {
                      receipt_quotation: null,
                      quotation_receipt: { none: {} },
                    },
                  },
                }
                :  is_promotion === 3 ? {
                  receipt_number: null,
                  payment_type: "gratis",
                } : {}),
          },
          _count: { id: true },
          _sum: { grand_total: true }
        }),
        this.dbService.orders.groupBy({
          by: ["vendor_id"],
          where: {
            vendor_id: { in: vendorIds },
            deleted_at: null,
            ...(order_date_from && order_date_to
              ? {
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`),
                },
              }
              : {}),
            status: {
              category: { in: ['SURVEYREQ', 'TUKANGSURVEY', 'SURVEYSTART', 'SURVEYDONE', 'RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE', 'RETUKANGSURVEY'] }
            }
          },
          _count: { id: true },
          _sum: { grand_total: true }
        }),
        this.dbService.orders.groupBy({
          by: ["vendor_id"],
          where: {
            vendor_id: { in: vendorIds },
            deleted_at: null,
            ...(order_date_from && order_date_to
              ? {
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`),
                },
              }
              : {}),
            status: {
              category: { in: ['WORKSTART', 'WORKREQ', 'WORKDONE', 'TUKANGWORK', 'REWORKSTART', 'REWORKEND', 'REWORKREQ', 'REWORKDONE', 'RETUKANGWORKSTART', 'RETUKANGWORKEND', 'RETUKANGWORKREQ', 'RETUKANGWORKDONE'] }
            }
          },
          _count: { id: true },
          _sum: { grand_total: true }
        }),
      ]);

      const aggMap = (data: any[]) => Object.fromEntries(data.map(i => [i.vendor_id, i]));

      const orderMap = aggMap(ordersAggregate);
      const unpaidMap = aggMap(unpaidAggregate);
      const paidMap = aggMap(paidAggregate);
      const surveyMap = aggMap(surveyAggregate);
      const workMap = aggMap(workAggregate);

      const finalVendor = vendor.map(vendor => {
        const id = vendor.id;
        return {
          ...vendor,
          total_order: orderMap[id]?._count.id || 0,
          total_paid_order: paidMap[id]?._sum.grand_total || 0,
          total_unpaid_order: unpaidMap[id]?._sum.grand_total || 0,
          total_order_survey: surveyMap[id]?._count.id || 0,
          total_order_survey_value: surveyMap[id]?._sum.grand_total || 0,
          total_order_work: workMap[id]?._count.id || 0,
          total_order_work_value: workMap[id]?._sum.grand_total || 0
        };
      });

      if (Boolean(top_best)) {
        finalVendor.sort((a, b) => b.total_paid_order - a.total_paid_order);
      }

      const total = await this.dbService.vendor.count({ where });

      return {
        data: finalVendor,
        meta: {
          total,
          takeTotal: finalVendor.length,
          page,
          take
        }
      };

    } catch (error) {
      console.error(error);
      throw error;
    }
  }





  async findOne(id: number) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          orders: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          pic_vendor: {
            include: {
              users: true,
            },
          },
          tukang: {
            include: {
              tukang_area: {
                include: {
                  area: true,
                },
              },
              work_order_tukang: {
                where: {
                  deleted_at: null,
                },
                include: {
                  work_orders: {
                    include: {
                      status: true,
                      work_order_status: {
                        include: {
                          status: true,
                        },
                        orderBy: {
                          created_at: 'desc',
                        },
                      },
                      order: true,
                    },
                  },
                },
              },
            },
          },
          vendor_area: {
            where: {
              deleted_at: null,
            },
            include: {
              area: true,
            },
          },
          vendor_document: true,
          vendor_service: {
            where: {
              deleted_at: null,
            },
            include: {
              service_type: true,
            },
          },
          bank: true,
          work_orders: true,
          vendor_store: {
            where: {
              deleted_at: null,
            },
            select: {
              id: true,
              vendor_id: true,
              created_at: true,
              deleted_at: true,
              store: {
                select: {
                  id: true,
                  store_name: true,
                  additional_address: true,
                  address: true,
                  bank_account: true,
                  bank_name: true,
                  bank_number: true,
                  email: true,
                  phone_number_1: true,
                  phone_number_2: true,
                  area_id: true,
                  area: true,
                },
              },
            },
          },
        },
      });

      if (vendor && vendor.tukang) {
        const now = new Date().toISOString().split('T')[0];

        vendor.tukang = vendor.tukang.map((tukangItem) => {
          const dailySlots = tukangItem.work_order_tukang.filter((item) => {
            const orderDate = new Date(
              item.work_orders.work_order_status[0].created_at,
            )
              .toISOString()
              .split('T')[0];
            return (
              item.work_orders.status.category !== 'SURVEYDONE' &&
              item.work_orders.status.category !== 'WORKEND' &&
              orderDate === now
            );
          });

          return {
            ...tukangItem,
            slot_order: dailySlots.length,
          };
        });
      }

      return vendor;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async nextCode() {
    try {
      const vendor = await this.dbService.vendor.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return vendor[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


}
