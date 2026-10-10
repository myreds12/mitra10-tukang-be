/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkOrdersQueryService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        status,
        tukang_id,
        vendor_id,
      } = queryParamsDto;

      const skip = page * take - take;
      const where: Prisma.work_ordersWhereInput = {
        AND: [
          search
            ? {
              OR: [
                {
                  id: !isNaN(+search) ? +search : undefined,
                },
                {
                  order: {
                    members: {
                      whatsapp_number: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    members: {
                      phone_number: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    members: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    sales: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    store: {
                      store_name: {
                        contains: search,
                      },
                    },
                  },
                },
              ],
            }
            : undefined,
          status ? { status: { id: { in: status } } } : undefined,
          vendor_id
            ? {
              vendor_id: vendor_id,
            }
            : undefined,
          tukang_id
            ? {
              work_order_tukang: {
                some: {
                  tukang_id: tukang_id,
                },
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
        ].filter(Boolean),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };

      const [work_orders, total] = await Promise.all([
        this.dbService.work_orders.findMany({
          skip,
          take: take <= 0 ? undefined : take,
          where,
          orderBy: {
            created_at: 'desc',
          },
          include: {
            order: {
              include: {
                status: true,
                m_order_details: {
                  where: {
                    deleted_at: null,
                  },
                  include: {
                    item: true,
                  },
                },
                store: true,
                sales: true,
                members: true,
                quotation: {
                  select: {
                    id: true,
                    quotation_grand_total: true,
                    receipt_quotation: true,
                  },
                },
              },
            },
            request_tukang: {
              where: {
                deleted_at: null,
              },
              include: {
                tukang_to_request_tukang: true,
                tukang_to_replace_tukang: true,
              },
            },
            work_order_tukang: {
              where: {
                deleted_at: null,
              },
              include: {
                tukang: true,
              },
            },
            vendor: true,
            work_order_status: {
              where: {
                deleted_at: null,
              },
              include: {
                status: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        }),
        this.dbService.work_orders.count({
          where,
        }),
      ]);

      const userIds = [
        ...new Set(
          work_orders
            .flatMap((item) => [
              item.created_by,
              item.updated_by,
              item.deleted_by,
              ...item.work_order_status.map((status) => status.created_by),
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

      const workOrdersWithUser = work_orders.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
        work_order_status: item.work_order_status.map((status) => ({
          ...status,
          created_by: status.created_by
            ? userMap[status.created_by] || null
            : null,
        })),
      }));

      return {
        data: workOrdersWithUser,
        meta: { skip, page, take, total },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async findOne(id: number) {
    try {
      const work_orders = await this.dbService.work_orders.findFirst({
        where: {
          id,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
              order_history: {
                include: {
                  status: true,
                },
              },
            },
          },
          request_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            where: {
              deleted_at: null,
            },
            orderBy: { created_at: 'desc' },
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          status: true,
          work_order_evidences: true,
        },
      });

      if (!work_orders) throw Error('Work Order Not Found!');

      // Get user IDs from work order and order history
      const userIds = [
        work_orders.created_by,
        work_orders.updated_by,
        work_orders.deleted_by,
        ...work_orders.order.order_history.map((history) => history.created_by),
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the work_orders and order history
      const workOrdersWithUser = {
        ...work_orders,
        created_by: userMap[work_orders.created_by] || null,
        updated_by: userMap[work_orders.updated_by] || null,
        deleted_by: userMap[work_orders.deleted_by] || null,
        order: {
          ...work_orders.order,
          order_history: work_orders.order.order_history.map((history) => ({
            ...history,
            created_by: userMap[history.created_by] || null,
          })),
        },
      };

      return workOrdersWithUser;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async calenderWorkOrder(queryParamsDto: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        status,
        tukang_id,
        vendor_id,
      } = queryParamsDto;
      console.log(tukang_id);

      const skip = page * take - take;
      const where: Prisma.work_ordersWhereInput = {
        AND: [
          search
            ? {
              OR: [
                ...(isNaN(Date.parse(search))
                  ? []
                  : [
                    { request_work_time: { equals: new Date(search) } },
                    { survey_date: { equals: new Date(search) } },
                    { work_start_date: { equals: new Date(search) } },
                    { work_end_date: { equals: new Date(search) } },
                  ]),
                {
                  order: {
                    members: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
              ],
            }
            : undefined,
          status ? { status: { id: { in: status } } } : undefined,
          vendor_id
            ? {
              vendor_id: vendor_id,
            }
            : undefined,
          tukang_id
            ? {
              work_order_tukang: {
                some: {
                  tukang_id: tukang_id,
                },
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
        ].filter(Boolean),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };

      const total = await this.dbService.work_orders.count({
        where,
      });

      const work_orders = await this.dbService.work_orders.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: [
          {
            status: {
              status_urgency: 'desc',
            },
          },
        ],
        include: {
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
            },
          },
          request_tukang: {
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
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
          work_order_evidences: true,
        },
      });

      return {
        data: work_orders,
        meta: { skip, page, take, total },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}
