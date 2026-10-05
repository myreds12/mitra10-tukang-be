/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from '../common/dto/query-params.dto';

@Injectable()
export class OrderCalendarService {
  private readonly logger = new Logger(OrderCalendarService.name);

  constructor(private readonly dbService: PrismaService) {}

  async orderCalender(queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        sales_id,
        payment_type,
        store_id,
        vendor,
        work_order_status,
      } = queryParams;

      const skip = page * take - take;

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  { members: { full_name: { contains: search } } },
                  {
                    store: {
                      store_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    project_number: {
                      contains: search,
                    },
                  },
                ],
              },
            ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(work_order_status
            ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
            : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          store_id
            ? {
              store_id: {
                in: store_id,
              },
            }
            : undefined,
          vendor
            ? {
              vendor: {
                id: {
                  in: vendor,
                },
                deleted_at: null,
              },
            }
            : undefined,
          ...(date_from && date_to
            ? [
              {
                OR: [
                  {
                    AND: [
                      {
                        work_orders: null,
                      },
                      {
                        request_survey: {
                          gte: new Date(date_from),
                        },
                      },
                      {
                        request_survey: {
                          lte: new Date(`${date_to}T23:59:59.000Z`),
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        work_orders: {
                          survey_date: {
                            gte: new Date(date_from),
                          },
                        },
                      },
                      {
                        work_orders: {
                          survey_date: {
                            lte: new Date(`${date_to}T23:59:59.000Z`),
                          },
                        },
                      },
                      {
                        work_orders: {
                          work_start_date: null,
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        work_orders: {
                          work_start_date: {
                            gte: new Date(date_from),
                          },
                        },
                      },
                      {
                        work_orders: {
                          work_end_date: {
                            lte: new Date(`${date_to}T23:59:59.000Z`),
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const orders = await this.dbService.orders.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        include: {
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              area: true,
              join_location: true,
              member_number: true,
              full_name: true,
              email: true,
              phone_number: true,
              whatsapp_number: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  vendor: true,
                },
              },
            },
          },
          order_history: {
            select: {
              id: true,
              order_id: true,
              created_at: true,
              created_by: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                },
              },
            },
          },
          reschedule: {
            where: {
              deleted_at: null,
            },
            include: {
              reschedule_tukang: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
                include: {
                  tukang: true,
                },
              },
              status: true,
              reschedule_status: {
                include: {
                  status: true,
                },
              },
              reschedule_evidences: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
          sales: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              store_id: true,
              user_id: true,
              full_name: true,
              is_active: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          store: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              store_name: true,
              address: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
              status_urgency: true,
            },
          },
          complaints: {
            where: {
              deleted_at: null,
            },
          },
          vendor: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              company_name: true,
              is_active: true,
              work_orders: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              order_id: true,
              item_code: true,
              item_name: true,
              item_notes: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                },
              },
              unit_price: true,
              quantity: true,
              total: true,
              created_by: true,
              created_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_files: true,
        },
      });

      // Additional sorting by vendor company name
      orders.sort((a, b) => {
        const nameA = a.vendor ? a.vendor.company_name.toLowerCase() : '';
        const nameB = b.vendor ? b.vendor.company_name.toLowerCase() : '';
        return nameA.localeCompare(nameB);
      });

      const userIds = [
        ...new Set(
          orders
            .flatMap((order) => [
              order.created_by,
              order.updated_by,
              order.deleted_by,
              ...order.order_history
                .map((item) => item.created_by)
                .filter((id) => id),
            ])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({
          ...acc,
          [user.id]: user,
        }),
        {},
      );

      const ordersWithUser = orders.map((order) => ({
        ...order,
        created_by: order.created_by ? userMap[order.created_by] || null : null,
        updated_by: order.updated_by ? userMap[order.updated_by] || null : null,
        deleted_by: order.deleted_by ? userMap[order.deleted_by] || null : null,
        order_history: order.order_history.map((item) => ({
          ...item,
          created_by: item.created_by ? userMap[item.created_by] || null : null,
        })),
      }));
      const count = await this.dbService.orders.count({
        where,
      });

      return {
        data: ordersWithUser,
        meta: {
          total: count,
          page,
          take,
          takeTotal: ordersWithUser.length,
        },
      };
    } catch (error) {
      throw error;
    }
  }
}
