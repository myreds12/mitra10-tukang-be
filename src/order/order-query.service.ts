/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderQueryService {
  private readonly logger = new Logger(OrderQueryService.name);

  constructor(private readonly dbService: PrismaService) {}

  async findAll(queryParams: any) {
    const startTime = Date.now();
    try {
      const {
        take: rawTake,
        page: rawPage,
        search,
        status,
        date_from,
        date_to,
        order_by,
        sales_id,
        payment_type,
        store_id,
        vendor_id,
        work_order_status,
        is_invoice,
        is_active_warranty,
        tukang_id,
        is_expired_warranty,
        is_used_warranty,
        is_receipt,
        is_receipt_quotation,
        promotion,
        is_promotion,
        history_status,
        managers,
      } = queryParams;

      // ============================================================
      // SAFE PARSE — queryParams dari HTTP selalu string
      // ============================================================
      const take = Number(rawTake) || 0;
      const page = Number(rawPage) || 1;
      const skip = take > 0 ? page * take - take : 0;

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // ============================================================
      // WHERE CLAUSE
      // ============================================================
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
          ...(history_status
            ? [
              {
                order_history: {
                  some: { status_id: { in: history_status } },
                },
              },
            ]
            : []),
          ...(is_promotion
            ? [
              {
                OR: [
                  {
                    AND: [
                      { payment_type: 'gratis' },
                      { status: { category: 'WORKEND' } },
                    ],
                  },
                  {
                    AND: [
                      {
                        quotation: {
                          some: { promotion_id: { not: null } },
                        },
                      },
                      { status: { category: 'WORKEND' } },
                    ],
                  },
                ],
              },
            ]
            : []),
          ...(Boolean(managers)
            ? [
              { status: { category: { not: 'CANCEL' } } },
              { payment_type: { equals: 'survey' } },
            ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(work_order_status
            ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
            : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          ...(store_id ? [{ store_id: { in: store_id } }] : []),
          ...(vendor_id
            ? [{ vendor: { id: vendor_id, deleted_at: null } }]
            : []),
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
          ...(tukang_id
            ? [
              {
                work_orders: {
                  work_order_tukang: { some: { tukang_id: tukang_id } },
                },
              },
            ]
            : []),
          ...(Boolean(is_invoice)
            ? [{ invoice_details: { none: { deleted_at: null } } }]
            : []),
          ...(Boolean(is_active_warranty)
            ? [
              {
                work_orders: {
                  work_order_status: {
                    some: {
                      status: { category: 'WORKEND' },
                      created_at: { gte: sevenDaysAgo },
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_expired_warranty)
            ? [
              {
                OR: [
                  {
                    work_orders: {
                      work_order_status: {
                        some: {
                          status: { category: 'WORKEND' },
                          created_at: { lt: sevenDaysAgo },
                        },
                      },
                    },
                  },
                  { complaints: { some: { deleted_at: null } } },
                ],
              },
            ]
            : []),
          ...(is_receipt === 1 || is_receipt === '1'
            ? [{ receipt_number: { not: null } }]
            : is_receipt === 0 || is_receipt === '0'
              ? [{ receipt_number: null }]
              : []),
          ...(is_receipt_quotation === 1 || is_receipt_quotation === '1'
            ? [{ quotation: { some: { receipt_quotation: { not: null } } } }]
            : is_receipt_quotation === 0 || is_receipt_quotation === '0'
              ? [{ quotation: { some: { receipt_quotation: null } } }]
              : []),
          ...(Boolean(promotion)
            ? [{ quotation: { some: { promotion_id: { not: null } } } }]
            : []),
          ...(Boolean(is_used_warranty)
            ? [{ complaints: { some: { deleted_at: null } } }]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      // ============================================================
      // WHERE KHUSUS UNTUK PAID GRAND TOTAL
      // Reuse filter utama + tambah syarat receipt_quotation
      // ============================================================
      const wherePaid: Prisma.ordersWhereInput = {
        AND: [
          ...(Array.isArray(where.AND) ? where.AND : []),
          {
            quotation: { some: { receipt_quotation: { not: null } } },
          },
        ],
      };

      // ============================================================
      // JALANKAN SEMUA QUERY SECARA PARALEL
      // ============================================================
      const [
        orders,
        count,
        orderGrandTotalAgg,
        orderPaidGrandTotalAgg,
        quotationSurveyAgg,
        quotationSurveyPaidAgg,
      ] = await Promise.all([
          // 1. Data utama dengan pagination
          this.dbService.orders.findMany({
            skip: take > 0 ? skip : undefined,
            take: take > 0 ? take : undefined,
            where,
            orderBy: { created_at: (order_by as 'asc' | 'desc') ?? 'desc' },
            include: {
              order_follow_up: {
                where: { deleted_at: null },
                orderBy: { created_at: 'desc' },
              },
              members: {
                select: {
                  id: true,
                  area_id: true,
                  area: true,
                  join_location: true,
                  member_number: true,
                  full_name: true,
                  email: true,
                  phone_number: true,
                  whatsapp_number: true,
                  address_1: true,
                  address_2: true,
                  zip_code: true,
                  rating: true,
                  join_date: true,
                  created_at: true,
                  updated_at: true,
                  created_by: true,
                  updated_by: true,
                },
              },
              reschedule: {
                where: { deleted_at: null },
                include: {
                  reschedule_tukang: {
                    where: { deleted_at: null, deleted_by: null },
                    include: { tukang: true },
                  },
                  status: true,
                  reschedule_status: { include: { status: true } },
                  reschedule_evidences: { where: { deleted_at: null } },
                },
              },
              invoice_details: {
                where: { deleted_at: null },
                select: {
                  invoice_number: true,
                  total: true,
                  type: true,
                  invoices: {
                    select: {
                      id: true,
                      status: true,
                      total_amount: true,
                      invoice_logs: true,
                      description: true,
                      vendor: true,
                    },
                  },
                },
              },
              sales: {
                where: { deleted_at: null, deleted_by: null },
                select: {
                  id: true,
                  store_id: true,
                  user_id: true,
                  full_name: true,
                  nik: true,
                  bank_id: true,
                  bank_branch: true,
                  account_name: true,
                  is_active: true,
                  created_at: true,
                  updated_at: true,
                  created_by: true,
                  updated_by: true,
                },
              },
              store: {
                select: {
                  id: true,
                  store_name: true,
                  address: true,
                  area_id: true,
                  area: true,
                  zip_code: true,
                  created_at: true,
                  updated_at: true,
                  created_by: true,
                  updated_by: true,
                },
              },
              status: {
                select: { id: true, category: true, description: true },
              },
              complaints: {
                where: { deleted_at: null },
                select: {
                  id: true,
                  complaint_status: true,
                  created_at: true,
                },
              },
              vendor: {
                where: { deleted_at: null, deleted_by: null },
                select: {
                  id: true,
                  company_name: true,
                  address: true,
                  phone_number: true,
                  is_active: true,
                  work_orders: {
                    where: { deleted_at: null, deleted_by: null },
                  },
                },
              },
              order_history: {
                ...(history_status
                  ? { where: { status_id: { in: history_status } } }
                  : undefined),
                select: {
                  order_id: true,
                  created_at: true,
                  status: {
                    select: { id: true, category: true, description: true },
                  },
                },
              },
              m_order_details: {
                where: { deleted_at: null, deleted_by: null },
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
                      invoice_nominal: true,
                    },
                  },
                  sales: true,
                  unit_price: true,
                  quantity: true,
                  total: true,
                  comission: true,
                  created_by: true,
                  created_at: true,
                },
              },
              quotation: {
                where: { deleted_at: null, deleted_by: null },
                select: {
                  id: true,
                  order_id: true,
                  store_id: true,
                  quotation_number: true,
                  quotation_date: true,
                  quotation_grand_total: true,
                  receipt_quotation: true,
                  promotion_id: true,
                  promotion: true,
                  quotation_receipt: true,
                  quotation_files: true,
                },
              },
              work_orders: {
                where: { deleted_at: null },
                include: {
                  vendor: true,
                  work_order_status: {
                    include: {
                      status: true,
                    },
                    orderBy: { created_at: 'desc' },
                  },
                },
              },
            },
          }),

          // 2. Count total record
          this.dbService.orders.count({ where }),

          // 3. Fast SQL aggregate untuk grand total
          this.dbService.orders.aggregate({
            _sum: { grand_total: true },
            where,
          }),

          // 4. Fast SQL aggregate untuk paid grand total
          this.dbService.orders.aggregate({
            _sum: { grand_total: true },
            where: wherePaid,
          }),

          // 5. Fast SQL aggregate untuk quotation survey
          this.dbService.quotation.aggregate({
            _sum: { quotation_grand_total: true },
            where: {
              deleted_at: null,
              order: {
                AND: [
                  ...(Array.isArray(where.AND) ? where.AND : []),
                  { payment_type: 'survey' },
                ],
              },
            },
          }),

          // 6. Fast SQL aggregate untuk quotation survey paid
          this.dbService.quotation.aggregate({
            _sum: { quotation_grand_total: true },
            where: {
              deleted_at: null,
              receipt_quotation: { not: null },
              order: {
                AND: [
                  ...(Array.isArray(wherePaid.AND) ? wherePaid.AND : []),
                  { payment_type: 'survey' },
                ],
              },
            },
          }),
        ]);

      // ============================================================
      // MAP USER IDs
      // ============================================================
      const userIds = [
        ...new Set(
          orders
            .flatMap((o) => [o.created_by, o.updated_by, o.deleted_by])
            .filter(Boolean),
        ),
      ];

      const users =
        userIds.length > 0
          ? await this.dbService.users.findMany({
              where: { id: { in: userIds } },
              select: { id: true, username: true },
            })
          : [];

      const userMap = users.reduce(
        (acc, user) => ({ ...acc, [user.id]: user }),
        {} as Record<string, any>,
      );

      const ordersWithUser = orders.map((order) => ({
        ...order,
        created_by: order.created_by ? userMap[order.created_by] ?? null : null,
        updated_by: order.updated_by ? userMap[order.updated_by] ?? null : null,
        deleted_by: order.deleted_by ? userMap[order.deleted_by] ?? null : null,
      }));

      // ============================================================
      // HITUNG GRAND TOTAL DARI HASIL AGREGAT DATABASE
      // ============================================================
      const orderGrandTotal =
        (Number(orderGrandTotalAgg._sum.grand_total) || 0) +
        (Number(quotationSurveyAgg._sum.quotation_grand_total) || 0);

      const orderPaidGrandTotal =
        (Number(orderPaidGrandTotalAgg._sum.grand_total) || 0) +
        (Number(quotationSurveyPaidAgg._sum.quotation_grand_total) || 0);

      this.logger.log(
        `[findAll] Completed in ${Date.now() - startTime}ms (Page: ${page}, Take: ${take}, Returned: ${orders.length}, Total: ${count})`,
      );

      return {
        data: ordersWithUser,
        total: count,
        page,
        take,
        orderGrandTotal,
        orderPaidGrandTotal,
        meta: {
          total: count,
          orderGrandTotal,
          orderPaidGrandTotal,
          page,
          take,
          takeTotal: orders.length,
        },
      };
    } catch (error) {
      this.logger.error('Error findAll orders:', error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const order = await this.dbService.orders.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          order_follow_up: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          members: true,
          sales: true,
          status: true,
          vendor: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              company_name: true,
              address: true,
              phone_number: true,
              is_active: true,
              work_orders: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          store: true,
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
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  prices: true,
                  default_price: true,
                  service_name: true,
                },
              },
              item_notes: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
          order_files: {
            where: {
              deleted_at: null,
            },
          },
          complaints: {
            include: {
              complaint_channels: true,
              complaint_histories: {
                include: {
                  complaint_evidence: true,
                },
              },
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            orderBy: {
              created_at: 'desc',
            },
            include: {
              promotion: true,
              quotation_receipt: true,
              quotation_details: {
                where: {
                  deleted_at: null,
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
          order_history: {
            select: {
              id: true,
              order_id: true,
              payload: true,
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
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoice_number: true,
              total: true,
              type: true,
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  invoice_logs: true,
                  description: true,
                  vendor: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const userIds = [
        order.created_by,
        order.updated_by,
        order.deleted_by,
        ...order.order_history
          .map((item) => item.created_by)
          .filter((id) => id),
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, roles: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the orders
      const ordersWithUser = {
        ...order,
        created_by: userMap[order.created_by] || null,
        updated_by: userMap[order.updated_by] || null,
        deleted_by: userMap[order.deleted_by] || null,
        order_history: order.order_history.map((item) => ({
          ...item,
          created_by: item.created_by ? userMap[item.created_by] || null : null,
        })),
      };

      const logs = await this.dbService.mail_logs.findMany({
        where: {
          moduleId: id,
        },
        select: {
          id: true,
          emailMessageId: true,
          moduleId: true,
          data: true,
          to: true,
          status: true,
          createdAt: true,
          emailMessages: true,
        },
      });

      console.log('Logs Order Find One : ', logs);

      const mailLogs = logs.filter((item) => {
        try {
          const dataMailLogs = JSON.parse(item.data);
          return dataMailLogs.order && dataMailLogs.order.id === id;
        } catch (error) {
          console.error('Failed to parse mail log data', error);
          return false;
        }
      });


      const data = {
        ...ordersWithUser,
      };

      data['order_details'] = data.m_order_details;
      delete data.m_order_details;

      return {
        data,
        meta: {
          mailLogs: mailLogs,
          dataLogs: mailLogs.map((item) => JSON.parse(item.data)),
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
