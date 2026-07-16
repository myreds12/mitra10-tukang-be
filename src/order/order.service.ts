/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { MailType } from 'src/mails/enum/mail_type.enum';
import { basename, join } from 'path';
import { PdfService } from 'src/common/service/pdf.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { CreateMemberDto } from 'src/member/dto/create-member.dto';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
    private notifService: NotificationsService,
    private configService: ConfigService,
    private readonly whatsAppService: WhatsAppService,
  ) { }
  // Tambahkan sebagai private method di dalam OrderService
  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isConnectionError =
          error?.message?.includes('TokenError') ||
          error?.message?.includes('ConnectorError') ||
          error?.code === 'P1001' ||
          error?.code === 'P1002';

        if (isConnectionError && attempt < retries) {
          console.warn(`⚠️ DB error, retrying ${attempt}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          await this.dbService.$disconnect();
          await this.dbService.$connect();
          continue;
        }
        throw error;
      }
    }
  }

  // Lalu di method update(), wrap bagian items.findMany:


  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    order_files: Array<Express.Multer.File>,
  ) {
    try {
      // console.log(createOrderDto);

      const { id: user_id, role_id } = user;
      const ROLES = await this.dbService.roles.findMany();

      const SALES_ROLES = ROLES.find(({ name }) =>
        name.toLowerCase().includes('sales'),
      );

      const salesUser = await this.dbService.users.findFirst({
        where: { id: user_id },
        include: {
          sales: {
            ...(role_id !== SALES_ROLES?.id
              ? { where: { id: createOrderDto.sales_id } }
              : undefined),
            orderBy: {
              created_at: 'desc',
            },
            include: {
              sales_categories: true,
            },
          },
        },
      });

      if (createOrderDto.receipt_number) {
        const existingOrder = await this.dbService.orders.findFirst({
          where: {
            receipt_number: createOrderDto.receipt_number,
            NOT: {
              status: {
                category: {
                  in: ['CANCELREFUND', 'CANCEL'],
                },
              },
            },
          },
        });

        if (existingOrder) {
          throw new BadRequestException(
            `Receipt number ${createOrderDto.receipt_number} already exists!`,
          );
        }
      }

      const orderDetailItems = await this.dbService.items.findMany({
        where: {
          id: {
            in: createOrderDto.order_details.map(({ item_id }) => item_id),
          },
          deleted_at: null,
          is_active: true,
        },
        include: {
          category: true,
          prices: {
            where: {
              periodic_start: { lte: new Date() },
              periodic_end: { gte: new Date() },
            },
          },
        },
      });

      if (orderDetailItems.some((item) => item === null))
        throw new BadRequestException('Item not found!');

      let grand_total = 0;
      let grand_total_comission = 0;

      const files: Array<Prisma.order_filesCreateManyOrderInput> =
        order_files.map((item) => ({
          type: 'any',
          path: item.filename,
          created_by: user_id,
        }));

      // const ROLE_STATUS = await this.dbService.status.findFirst({
      //   where: {
      //     category: {
      //       equals: role_id === STORE_ROLES.id ? 'picklist' : 'book',
      //     },
      //   },
      // });

      if (createOrderDto.payment_type === PAYMENT_TYPE.SURVEY) {
        grand_total += 99000;
      }

      const order_details: Prisma.m_order_detailsCreateManyOrderInput[] =
        createOrderDto.order_details.map((item) => {
          let total = 0;
          const currentItem = orderDetailItems?.find(
            ({ id }) => id === item?.item_id,
          );
          const itemPrice =
            currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
              ?.price ??
            currentItem?.default_price ??
            0;
          const comission = Number(
            salesUser?.sales[0]?.sales_categories?.find(
              ({ category_id }) => currentItem?.category_id === category_id,
            )?.commission ?? 0,
          );

          if (
            PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY === createOrderDto.payment_type
          ) {
            total = Number(itemPrice) * item.quantity;
            grand_total += total;
            grand_total_comission += comission;
          }

          return {
            ...item,
            item_notes: item?.item_notes,
            unit_price: itemPrice,
            created_by: user_id,
            total,
            comission,
            sales_id: salesUser?.sales[0]?.id ?? createOrderDto.sales_id,
          };
        });
      if (createOrderDto.is_overdistance === 1)
        grand_total += createOrderDto.additional_fee ?? 25000;

      const orderConnection = Object.fromEntries(
        Object.entries({
          members: { connect: { id: createOrderDto.member_id } },
          store: { connect: { id: createOrderDto.store_id } },
          status: { connect: { id: createOrderDto.project_status_id } },
          sales: { connect: { id: createOrderDto.sales_id } },
          vendor: createOrderDto.vendor_id
            ? { connect: { id: createOrderDto.vendor_id } }
            : undefined,
        }).filter(([value]) => value !== undefined),
      );

      const orderData = {
        notes: createOrderDto.notes,
        project_address: createOrderDto.project_address,
        project_number: createOrderDto.project_number,
        receipt_number: createOrderDto.receipt_number,
        ...(createOrderDto.request_work
          ? {
            request_work: new Date(createOrderDto.request_work),
          }
          : undefined),
        grand_total: grand_total.toFixed(2),
        grand_total_comission: grand_total_comission.toFixed(2),
        is_overdistance: createOrderDto.is_overdistance,
        ...(createOrderDto.is_overdistance === 1
          ? {
            additional_fee: createOrderDto?.additional_fee ?? 25000,
          }
          : undefined),
        created_by: user_id,
        payment_type: createOrderDto.payment_type,
        print_counter: 0,
        request_survey: new Date(createOrderDto.request_survey),
      };

      const ordersOptions: Prisma.ordersCreateArgs = {
        data: {
          ...orderConnection,
          ...orderData,
          m_order_details: { createMany: { data: order_details } },
          order_files: { createMany: { data: files } },
        },
        include: {
          status: true,
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [salesOrder, order] = await this.dbService.$transaction([
        this.dbService.sales.update({
          where: {
            id: salesUser?.sales[0]?.id ?? createOrderDto.sales_id,
          },
          data: {
            order_total: {
              increment: 1,
            },
          },
        }),
        this.dbService.orders.create({
          data: {
            ...ordersOptions.data,
          },
          include: {
            status: true,
            work_orders: {
              include: {
                work_order_tukang: true,
              },
            },
          },
        }),
      ]);

      if (order) {
        await this.notifService.create(
          { orders: order },
          'CREATE',
          order.created_by,
          moduleTypeNotification.ORDER,
          order.id,
          order.project_status_id,
        );
      }

      await this.addHistory(
        order.id,
        order.project_status_id,
        user,
        createOrderDto,
      );

      await this.whatsAppService.sendOrderCreatedNotification(order.id);

      return order;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(queryParams: any) {
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
      // count + grand total aggregasi + data utama
      // ============================================================
      const [orders, count, orderGrandTotalData, orderPaidGrandTotalData] =
        await Promise.all([
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
                where: { deleted_at: null, deleted_by: null },
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
                include: {
                  complaint_histories: {
                    include: { complaint_evidence: true },
                  },
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
                include: {
                  promotion: true,
                  quotation_receipt: true,
                  quotation_details: { include: { item: true } },
                  quotation_files: true,
                },
              },
              work_orders: {
                where: { deleted_at: null },
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
                    include: { tukang: true },
                    where: { deleted_at: null, deleted_by: null },
                  },
                  work_order_status: {
                    include: {
                      status: true,
                      work_order_items: {
                        include: { item: true },
                        where: { deleted_at: null, deleted_by: null },
                      },
                    },
                    orderBy: { created_at: 'desc' },
                  },
                },
              },
              order_files: true,
            },
          }),

          // 2. Count total record
          this.dbService.orders.count({ where }),

          // 3. Grand total semua order — hanya field yang diperlukan
          this.dbService.orders.findMany({
            where,
            select: {
              grand_total: true,
              payment_type: true,
              quotation: {
                select: { quotation_grand_total: true },
              },
            },
          }),

          // 4. Grand total order yang sudah paid (ada receipt_quotation)
          this.dbService.orders.findMany({
            where: wherePaid,
            select: {
              grand_total: true,
              payment_type: true,
              quotation: {
                select: { quotation_grand_total: true },
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

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

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
      // HITUNG GRAND TOTAL
      // ============================================================
      const calcGrandTotal = (
        data: { grand_total: any; payment_type: string; quotation: any[] }[],
      ): number => {
        return data.reduce((total, order) => {
          let grandTotal = Number(order.grand_total) || 0;
          if (order.payment_type === 'survey' && order.quotation?.length) {
            grandTotal += order.quotation.reduce(
              (qTotal, q) => qTotal + (Number(q.quotation_grand_total) || 0),
              0,
            );
          }
          return total + grandTotal;
        }, 0);
      };

      const orderGrandTotal = calcGrandTotal(orderGrandTotalData);
      const orderPaidGrandTotal = calcGrandTotal(orderPaidGrandTotalData);

      return {
        data: ordersWithUser,
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
      console.error(error);
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

  async update(
    id: number,
    updateOrderDto: UpdateOrderDto,
    user?: users,
    order_files?: Express.Multer.File[],
  ) {
    try {
      const { id: user_id } = user;
      const arrayFields = ['order_details', 'existing_order_files'];

      // Normalisasi duplikat field scalar
      for (const key of Object.keys(updateOrderDto)) {
        if (!arrayFields.includes(key) && Array.isArray(updateOrderDto[key])) {
          updateOrderDto[key] = updateOrderDto[key][0];
        }
      }

      // ✅ Normalisasi existing_order_files jika duplikat
      // Payload duplikat 3x → existing_order_files bisa jadi array of arrays
      if (Array.isArray(updateOrderDto.existing_order_files)) {
        // Flatten jika nested array akibat duplikat
        const flattened = updateOrderDto.existing_order_files.flat();

        // Deduplikasi berdasarkan order_file_id
        const seen = new Set<number>();
        updateOrderDto.existing_order_files = flattened.filter((item) => {
          const fileId = Number(item?.order_file_id);
          if (seen.has(fileId)) return false;
          seen.add(fileId);
          return true;
        });
      }

      // ✅ Normalisasi order_details jika duplikat (sama seperti existing_order_files)
      if (Array.isArray(updateOrderDto.order_details)) {
        const flattened = updateOrderDto.order_details.flat();

        const seen = new Set<number>();
        updateOrderDto.order_details = flattened.filter((item) => {
          const detailId = Number(item?.id ?? item?.item_id);
          if (seen.has(detailId)) return false;
          seen.add(detailId);
          return true;
        });
      }


      if (updateOrderDto.receipt_number) {
        const existingOrder = await this.dbService.orders.findFirst({
          where: {
            id: { not: id },
            receipt_number: updateOrderDto.receipt_number,
            NOT: {
              status: {
                category: {
                  in: ['CANCELREFUND', 'CANCEL'],
                },
              },
            },
          },
        });

        if (existingOrder) {
          throw new BadRequestException(
            `Receipt number ${updateOrderDto.receipt_number} already exists!`,
          );
        }
      }
      const files: Array<Prisma.order_filesCreateManyOrderInput> =
        order_files.map((item) => ({
          type: 'any',
          path: item.filename,
          created_by: user_id,
        }));

      // console.log('UpdaeDto', updateOrderDto);
      const { data: order } = await this.findOne(id);

      if (!order) throw new NotFoundException('Order not found');

      const orderdetailsIds = updateOrderDto.order_details
        ? updateOrderDto.order_details
          .filter((x) => Boolean(x.id))
          .map((x) => Number(x.id))
          .filter((x) => !isNaN(x) && x > 0)
        : undefined;

      // ✅ Guard: hanya query jika ada ID yang valid
      const orderDetail = orderdetailsIds && orderdetailsIds.length > 0
        ? await this.dbService.m_order_details.findMany({
          where: {
            id: { in: orderdetailsIds },
          },
          include: {
            item: {
              include: {
                category: true,
                prices: {
                  where: {
                    periodic_start: { lte: new Date() },
                    periodic_end: { gte: new Date() },
                  },
                },
              },
            },
          },
        })
        : [];

      // ✅ Perbaikan: guard jika order_details tidak ada atau item_id kosong semua
      const whereItems = updateOrderDto.order_details
        ? (() => {
          const itemIds = updateOrderDto.order_details
            .filter((x) => Boolean(x.item_id))
            .map((x) => Number(x.item_id))
            .filter((x) => !isNaN(x) && x > 0);

          // ✅ Jika tidak ada item_id sama sekali, return undefined
          return itemIds.length > 0
            ? { id: { in: itemIds } }
            : undefined;
        })()
        : undefined;

      const items = updateOrderDto.order_details &&
        updateOrderDto.order_details.length > 0 &&
        updateOrderDto.order_details.some(x => Boolean(x.item_id))
        ? await this.dbService.items.findMany({
          where: {
            id: {
              in: updateOrderDto.order_details
                .filter((x) => Boolean(x.item_id))
                .map((x) => Number(x.item_id))
                .filter((x) => !isNaN(x) && x > 0),
            },
            deleted_at: null,
            is_active: true,
          },
          include: {
            category: true,
            prices: {
              where: {
                periodic_start: { lte: new Date() },
                periodic_end: { gte: new Date() },
              },
            },
          },
        })
        : [];

      if (updateOrderDto.order_details) {
        const checkOrderDetailIds = orderdetailsIds.filter(
          (x) => !orderDetail.some((y) => x === y.id),
        );

        if (checkOrderDetailIds.length)
          throw new NotFoundException({
            messages: 'The provided detail id not found',
            errorIds: checkOrderDetailIds,
          });
      }

      const salesUser = await this.dbService.sales.findFirst({
        where: {
          id: order.sales_id ?? updateOrderDto.sales_id,
        },
        include: {
          sales_categories: true,
        },
      });

      let grand_total = 0;
      let grand_total_comission = 0;
      if (updateOrderDto?.payment_type === PAYMENT_TYPE.SURVEY) {
        // sama kayak create: hardcoded 99000
        grand_total += 99000;
        if (updateOrderDto.additional_fee && updateOrderDto.is_overdistance === 1) {
          grand_total += Number(updateOrderDto.additional_fee) - +order.additional_fee;
        } else if (updateOrderDto.is_overdistance === 0) {
          grand_total -= +order.additional_fee;
        }
      } else if (updateOrderDto?.payment_type === PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY) {
        // grand_total dihitung dari item di loop order_details di bawah
        grand_total +=
          updateOrderDto.additional_fee && updateOrderDto.is_overdistance === 1
            ? Number(updateOrderDto.additional_fee)
            : 0;
      } else {
        // gratis atau payment_type lain → grand_total = 0, tidak ngambil dari DB
        grand_total += 0;
      }

      const orderDetailUpsert: Prisma.m_order_detailsUpsertWithWhereUniqueWithoutOrderInput[] =
        updateOrderDto.order_details
          ? updateOrderDto.order_details.map((item) => {
            let total = 0;
            const currentItem = items?.find(({ id }) => id === item?.item_id);

            const itemPrice =
              currentItem?.prices.filter(
                (x) => item.quantity >= x.min_order,
              )?.[0]?.price ??
              currentItem?.default_price ??
              0;

            const comission = Number(
              salesUser?.sales_categories?.find(
                ({ category_id }) => currentItem?.category_id === category_id,
              )?.commission ?? 0,
            );

            if (
              [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY].includes(
                updateOrderDto.payment_type,
              )
            ) {
              total = Number(itemPrice) * item.quantity;
              grand_total +=
                total +
                (updateOrderDto.additional_fee &&
                  updateOrderDto.is_overdistance === 1
                  ? Number(updateOrderDto.additional_fee) -
                  +order.additional_fee
                  : updateOrderDto.is_overdistance === 0
                    ? +order.additional_fee
                    : 0);
              grand_total_comission += comission;
            }

            return {
              where: { id: item?.id ?? 0, order_id: id },
              update: {
                item_notes: item?.item_notes,
                item_name: item?.item_name ?? '',
                item_code: item?.item_code ?? '',
                item_id: item?.item_id ?? undefined,
                quantity: item?.quantity,
                unit_price: itemPrice,
                total,
                comission,
                updated_by: user_id,
                updated_at: new Date(),
              },
              create: {
                item_notes: item?.item_notes,
                ...(item.item_id
                  ? {
                    item: {
                      connect: {
                        id: item.item_id,
                      },
                    },
                  }
                  : undefined),
                ...(updateOrderDto.sales_id
                  ? {
                    sales: {
                      connect: {
                        id: updateOrderDto.sales_id ?? order.sales_id,
                      },
                    },
                  }
                  : undefined),
                item_name: item?.item_name ?? '',
                item_code: item?.item_code ?? '',
                quantity: item?.quantity,
                unit_price: itemPrice,
                total,
                comission,
                created_by: user_id,
                created_at: new Date(),
              },
            };
          })
          : undefined;

      const orderUpdateData: Prisma.ordersUncheckedUpdateInput = {
        notes: updateOrderDto?.notes ?? undefined,
        is_overdistance: updateOrderDto?.is_overdistance ?? undefined,
        ...(updateOrderDto?.is_overdistance === 1
          ? {
            additional_fee: updateOrderDto?.additional_fee ?? 25000,
          }
          : { additional_fee: 0 }),
        member_id: updateOrderDto?.member_id ?? undefined,
        sales_id: updateOrderDto?.sales_id ?? undefined,
        store_id: updateOrderDto?.store_id ?? undefined,
        vendor_id: updateOrderDto?.vendor_id ?? undefined,
        project_address: updateOrderDto?.project_address ?? undefined,
        receipt_number: updateOrderDto?.receipt_number ?? undefined,
        grand_total: grand_total,
        grand_total_comission: grand_total_comission,
        updated_by: user_id,
        payment_type: updateOrderDto?.payment_type ?? undefined,
        project_status_id: updateOrderDto?.project_status_id ?? undefined,
        print_counter: 0,
        updated_at: new Date(),
        request_survey: updateOrderDto?.request_survey
          ? new Date(updateOrderDto?.request_survey ?? undefined)
          : undefined,
        request_work: updateOrderDto?.request_work
          ? new Date(updateOrderDto?.request_work ?? undefined)
          : undefined,
        order_files: {
          createMany: {
            data: files,
          },
        },
      };

      const deletedDetailsId = updateOrderDto.order_details
        ? updateOrderDto.order_details
          .filter((x) => Boolean(x?.id))
          .map((item) => {
            return item.id;
          })
        : undefined;
      const deletedOrderFile = updateOrderDto.existing_order_files
        ? updateOrderDto?.existing_order_files
          .filter((x) => Boolean(x?.order_file_id))
          .map((item) => {
            return Number(item.order_file_id);
          })
        : undefined;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [syncDetails, syncFiles, orderQuery] =
        await this.dbService.$transaction([
          this.dbService.m_order_details.updateMany({
            where: {
              order_id: id,
              ...(deletedDetailsId && deletedDetailsId.length
                ? {
                  id: {
                    notIn: deletedDetailsId,
                  },
                }
                : undefined),
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.order_files.updateMany({
            where: {
              ...(deletedOrderFile
                ? {
                  id: {
                    notIn: deletedOrderFile,
                  },
                }
                : undefined),
              order_id: id,
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.orders.update({
            where: {
              id: order.id,
            },
            data: {
              ...orderUpdateData,
              ...(updateOrderDto.order_details
                ? {
                  m_order_details: {
                    upsert: orderDetailUpsert,
                  },
                }
                : undefined),
            },
            include: {
              status: true,
              work_orders: {
                include: {
                  work_order_tukang: true,
                },
              },
            },
          }),
        ]);

      if (orderQuery) {
        await this.notifService.create(
          { orders: orderQuery },
          'UPDATE',
          orderQuery.updated_by,
          moduleTypeNotification.ORDER,
          orderQuery.id,
          orderQuery.project_status_id,
        );
      }

      await this.addHistory(
        orderQuery.id,
        orderQuery.project_status_id,
        user,
        updateOrderDto,
      );

      if (
        updateOrderDto.project_status_id &&
        updateOrderDto.project_status_id !== order.project_status_id
      ) {
        await this.whatsAppService.sendOrderCompletedNotification(orderQuery.id);
      }

      return orderQuery;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }



  async remove(id: number) {
    return await this.dbService.orders.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: 3,
      },
    });
  }

  async counter(id: number) {
    try {
      const order = await this.dbService.orders.findFirst({
        where: {
          id,
        },
      });

      if (!order) throw new NotFoundException('Order not found');

      this.dbService.$transaction([
        this.dbService.orders.update({
          where: {
            id,
          },
          data: {
            print_counter: order.print_counter + 1,
          },
        }),
      ]);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkStatus() {
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'BOOK',
          },
        },
      });

      const statusUnpaid = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'UNPAID',
          },
        },
      });

      const date = new Date();
      const thirdDateTime = new Date(date.setDate(date.getDate() - 3));
      await this.dbService.orders.updateMany({
        where: {
          status: {
            id: status.id,
          },
          created_at: {
            lt: thirdDateTime,
          },
        },
        data: {
          project_status_id: statusUnpaid.id,
        },
      });

      // return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOrder() {
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: 'PICKLIST',
        },
      });

      if (!status) {
        throw new Error('Status not found');
      }

      const orderIds = await this.dbService.orders.findMany({
        where: {
          project_status_id: status.id,
        },
        select: {
          id: true,
        },
      });

      const orderIdsArray = orderIds.map((order) => order.id);

      // Use Prisma transaction to delete related entries first and then the orders
      const deleteOrdersTransaction = await this.dbService.$transaction([
        this.dbService.order_files.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.order_histories.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.m_order_details.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.orders.deleteMany({
          where: {
            id: { in: orderIdsArray },
          },
        }),
      ]);

      return { deletedOrdersCount: deleteOrdersTransaction[3].count };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatus(id: number, status_id: number, user: users) {
    try {
      const order = await this.findOne(id);

      if (!order) throw new BadRequestException('Order does not Exist!');
      const [STATUS] = await this.dbService.status.findMany({
        where: {
          id: status_id,
        },
        orderBy: {
          category: 'desc',
        },
      });
      const orderData: Prisma.ordersUpdateInput = {
        status: {
          connect: {
            id: STATUS.id,
          },
        },
      };

      const [orders] = await this.dbService.$transaction([
        this.dbService.orders.update({
          where: {
            id,
          },
          data: orderData,
          include: {
            work_orders: {
              include: {
                work_order_tukang: true,
              },
            },
          },
        }),
      ]);
      if (orders) {
        await this.notifService.create(
          { orders: orders },
          'UPDATE',
          user.id,
          moduleTypeNotification.ORDER,
          orders.id,
          orders.project_status_id,
        );
      }

      await this.addHistory(orders.id, orders.project_status_id, user, orders);
      await this.whatsAppService.sendOrderCompletedNotification(orders.id);

      return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // TODO: type-def for payload only order ...
  async addHistory(
    id: number,
    status_id: number,
    user: users,
    payload: any,
  ): Promise<void> {
    try {
      // TODO: THE ORDER HISTORY FUNCTION ...
      // TODO: SAVE THE PAYLOAD TO THE HISTORY TABLE ...
      // JSON.stringify(payload)

      await this.dbService.order_histories.create({
        data: {
          order_id: id,
          status_id: status_id,
          payload: JSON.stringify(payload),
          created_by: user.id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async orderDetailsPublic(query: QueryParamsDto) {
    try {
      let { order_id, phone_number, email_member, member_number } = query;

      const member = await this.dbService.members.findFirst({
        where: {
          phone_number: phone_number,
        },
      });
      if (member_number && !member) {
        if (member_number.startsWith('08')) {
          member_number = member_number.slice(1);
        } else if (member_number.startsWith('628')) {
          member_number = member_number.slice(2);
        }
      }
      const where: Prisma.ordersWhereInput = {
        id: +order_id,
        OR: [
          ...(email_member
            ? [
              {
                members: {
                  email: email_member,
                },
              },
            ]
            : []),
          ...(member_number
            ? [
              {
                members: {
                  member_number: member_number,
                },
              },
            ]
            : []),
          ...(phone_number
            ? [
              {
                members: {
                  member_number: phone_number,
                  // phone_number: phone_number,
                },
              },
            ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const order = await this.dbService.orders.findFirst({
        where,
        include: {
          members: true,
          sales: true,
          status: true,
          vendor: true,
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
              item_notes: true,
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
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              updated_by: true,
              created_at: true,
              updated_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              quotation_details: {
                include: {
                  item: true,
                },
              },
              promotion: true,
              quotation_files: true,
            },
          },
          order_files: true,
          complaints: true,
          work_orders: {
            include: {
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
        },
      });

      if (!order) throw new NotFoundException('Order not found!');

      const redirect_url = `${process.env.FE_URL
        }/detail-order?order_id=${order_id}${phone_number ? `&phone_number=${phone_number}` : ''
        }${email_member ? `&email_member=${email_member}` : ''}${member_number ? `&member_number=${member_number}` : ''
        }`;

      return {
        data: order,
        meta: {
          redirect_url,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async orderExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
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
        is_promotion,
      } = queryParams;

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
                  { members: { full_name: { contains: search } } },
                  { store: { store_name: { contains: search } } },
                  { project_number: { contains: search } },
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
        ].filter(Boolean),
        deleted_at: null,
      };

      // ============================================================
      // MINIMAL SELECT — hanya field yang dibutuhkan untuk kolom Excel
      // ============================================================
      const minimalSelect = {
        id: true,
        created_at: true,
        request_survey: true,
        payment_type: true,
        receipt_number: true,
        grand_total: true,
        members: {
          where: { deleted_at: null, deleted_by: null },
          select: {
            full_name: true,
            phone_number: true,
            whatsapp_number: true,
          },
        },
        sales: {
          where: { deleted_at: null, deleted_by: null },
          select: { full_name: true },
        },
        store: {
          select: { store_name: true },
        },
        status: {
          select: { description: true },
        },
        vendor: {
          where: { deleted_at: null, deleted_by: null },
          select: { company_name: true },
        },
        m_order_details: {
          where: { deleted_at: null, deleted_by: null },
          select: {
            item_name: true,
            quantity: true,
            item: {
              select: {
                category: {
                  select: { category_name: true },
                },
              },
            },
          },
        },
        quotation: {
          where: { deleted_at: null, deleted_by: null },
          select: {
            receipt_quotation: true,
            quotation_grand_total: true,
          },
        },
        work_orders: {
          where: { deleted_at: null },
          select: {
            survey_date: true,
            work_start_date: true,
            work_end_date: true,
            work_order_tukang: {
              where: { deleted_at: null, deleted_by: null },
              select: {
                tukang: {
                  select: { full_name: true },
                },
              },
            },
          },
        },
      };

      // ============================================================
      // SETUP WORKBOOK & WORKSHEET
      // ============================================================
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order', {
        properties: {
          tabColor: { argb: 'FF00FF00' },
          outlineLevelCol: 2,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Order Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 25 },
        { header: 'Order Dibuat', key: 'created_at', width: 30 },
        { header: 'Tanggal Request', key: 'request_survey', width: 35 },
        { header: 'Nama Customer', key: 'full_name', width: 40 },
        { header: 'Phone Number', key: 'phone_number', width: 30 },
        { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
        { header: 'Category', key: 'category_name', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 30 },
        { header: 'Payment Type', key: 'payment_type', width: 30 },
        { header: 'Nomor Receipt', key: 'receipt_number', width: 30 },
        { header: 'Receipt Quotation', key: 'receipt_quotation', width: 30 },
        { header: 'Order Status', key: 'status_order', width: 30 },
        { header: 'Tanggal Survey', key: 'survey_date', width: 40 },
        { header: 'Tanggal Pengerjaan', key: 'work_date', width: 55 },
        { header: 'Nama Vendor', key: 'company_name', width: 35 },
        { header: 'Nama Sales', key: 'sales_name', width: 35 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
        { header: 'Grand Total Survey', key: 'grand_total_survey', width: 30 },
        { header: 'Quotation Grand Total', key: 'quotation_grand_total', width: 30 },
        { header: 'Grand Total', key: 'grand_total', width: 25 },
      ];

      // Style header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // ============================================================
      // HELPER FUNCTIONS
      // ============================================================
      const formattedDateTime = (dateTime: Date | string): string => {
        const d = new Date(dateTime);
        return `${d.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${d.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      };

      const formatPaymentType = (type: string): string => {
        const map: Record<string, string> = {
          pemasangan_tanpa_survey: 'Pemasangan Tanpa Survey',
          survey: 'Survey',
          gratis: 'Gratis',
        };
        return map[type] ?? 'N/a';
      };

      const applyRowStyle = (row: exceljs.Row) => {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      };

      // ============================================================
      // FETCH & TULIS DATA PER BATCH — cursor-based pagination
      // FIX: tidak simpan semua data ke array (memory overflow)
      // FIX: loop logic lama Math.floor menyebabkan data terakhir hilang
      // ============================================================
      const BATCH_SIZE = 300;
      let lastId: number | undefined = undefined;
      let hasMore = true;
      let totalGrandTotalValue = 0;

      while (hasMore) {
        const batchWhere: Prisma.ordersWhereInput = lastId
          ? {
            ...where,
            AND: [
              ...(Array.isArray(where.AND) ? where.AND : []),
              { id: { gt: lastId } },
            ],
          }
          : where;

        const batch = await this.dbService.orders.findMany({
          where: batchWhere,
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          select: minimalSelect,
        });

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        // ── Proses setiap order langsung ke worksheet ──────────────
        for (const order of batch) {
          // Fallback jika order tidak punya detail item
          const details =
            order.m_order_details?.length > 0
              ? order.m_order_details
              : [{ item_name: null, quantity: null, item: null }];

          // Kumpulkan nama tukang sekali per order
          const tukangName =
            (order.work_orders as any)?.work_order_tukang?.length > 0
              ? [
                ...new Set(
                  (order.work_orders as any).work_order_tukang
                    .map((wot: any) => wot?.tukang?.full_name)
                    .filter(Boolean),
                ),
              ].join(', ')
              : 'Tukang belum ditugaskan';

          const workOrders = order.work_orders as any;
          let isFirstDetail = true;

          for (const detail of details) {
            const itemName = detail?.item_name ?? 'Item belum ditentukan';
            const categoryName =
              (detail?.item as any)?.category?.category_name ?? '';
            const quantity = detail?.quantity ?? 'Quantity Belum ditentukan';

            // ── Kalkulasi Grand Total ────────────────────────────
            const grandTotal = Number(order.grand_total) || 0;
            let grandTotalValue = 0;
            let grandTotalSurveyValue = 0;
            let quotationGrandTotalValue = 0;

            if (isFirstDetail) {
              if (order.payment_type === 'survey') {
                // FIX: ambil semua quotation, bukan hanya [0]
                const quotationGrandTotal =
                  order.quotation?.reduce(
                    (sum: number, q: any) =>
                      sum + Math.ceil(Number(q.quotation_grand_total) || 0),
                    0,
                  ) ?? 0;

                grandTotalSurveyValue = grandTotal;
                quotationGrandTotalValue = quotationGrandTotal;
                grandTotalValue = grandTotal + quotationGrandTotal;
                totalGrandTotalValue += grandTotalValue;
              } else {
                // FIX: sebelumnya `!isNaN(Number())` selalu true karena Number() = 0
                // Akibatnya non-survey dihitung 2x (di dalam if survey dan di luar)
                grandTotalValue = grandTotal;
                totalGrandTotalValue += grandTotal;
              }
            }
            // Detail ke-2 dst: semua 0 agar tidak double count

            worksheet.addRow({
              id: order.id,
              store_name: order.store?.store_name ?? 'N/a',
              created_at: formattedDateTime(order.created_at),
              request_survey: order.request_survey
                ? formattedDateTime(order.request_survey)
                : 'N/a',
              full_name: order.members?.full_name ?? 'N/a',
              phone_number:
                order.members?.phone_number ??
                order.members?.whatsapp_number ??
                'N/a',
              item_name: itemName,
              category_name: categoryName,
              quantity: quantity,
              payment_type: formatPaymentType(order.payment_type),
              receipt_number: order.receipt_number ?? 'Receipt belum terbit',
              receipt_quotation:
                order.payment_type === 'survey' &&
                  order.quotation?.[0]?.receipt_quotation
                  ? order.quotation[0].receipt_quotation
                  : 'Receipt Quotation tidak ada',
              status_order:
                order.status?.description ?? 'Order Tidak Memiliki Status',
              survey_date: workOrders?.survey_date
                ? formattedDateTime(workOrders.survey_date)
                : 'Order Tidak Ada Tanggal Survey',
              work_date:
                workOrders?.work_start_date && workOrders?.work_end_date
                  ? `${formattedDateTime(workOrders.work_start_date)} - ${formattedDateTime(workOrders.work_end_date)}`
                  : 'Order Tidak Ada Tanggal Pengerjaan',
              company_name: order.vendor?.company_name ?? 'Vendor Belum Ditentukan',
              sales_name: order.sales?.full_name ?? '',
              tukang_name: tukangName,
              grand_total_survey: grandTotalSurveyValue,
              quotation_grand_total: quotationGrandTotalValue,
              grand_total: grandTotalValue,
            });

            applyRowStyle(worksheet.lastRow);
            isFirstDetail = false;
          }
        }

        lastId = batch[batch.length - 1].id as number;

        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      // ============================================================
      // TOTAL ROW
      // ============================================================
      const totalRow = worksheet.addRow({
        id: 'Total',
        store_name: '',
        created_at: '',
        request_survey: '',
        full_name: '',
        phone_number: '',
        item_name: '',
        category_name: '',
        quantity: '',
        payment_type: '',
        receipt_number: '',
        receipt_quotation: '',
        status_order: '',
        survey_date: '',
        work_date: '',
        company_name: '',
        sales_name: '',
        tukang_name: '',
        grand_total_survey: '',
        quotation_grand_total: '',
        grand_total: totalGrandTotalValue,
      });

      totalRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      totalRow.height = 30;
      worksheet.mergeCells(`A${totalRow.number}:T${totalRow.number}`);

      // ============================================================
      // GENERATE FILE & SEND RESPONSE
      // ============================================================
      const getFormattedDate = (): string => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const folderPath = './storage/excel/order';
      if (!existsSync(folderPath)) {
        mkdirSync(folderPath, { recursive: true });
      }

      const excelFileName = `DataOrder-${getFormattedDate()}-${Date.now()}.xlsx`;
      const excelFilePath = join(folderPath, excelFileName);

      await workbook.xlsx.writeFile(excelFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${basename(excelFilePath)}`,
      );

      const fileStream = createReadStream(excelFilePath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error orderExportExcel:', error);
      throw error;
    }
  }

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
        // const urgencyComparison =
        //   b.status.status_urgency - a.status.status_urgency;
        // if (urgencyComparison !== 0) return urgencyComparison;

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

  async orderExportExcelHO(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
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
      } = queryParams;

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
          vendor_id
            ? {
              vendor: {
                id: vendor_id,
                deleted_at: null,
              },
            }
            : undefined,
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
        deleted_at: null,
      };

      const count = await this.dbService.orders.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;
        const data = await this.dbService.orders.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            created_at: order_by,
          },
          include: {
            members: {
              where: {
                deleted_at: null,
                deleted_by: null,
              },
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
                    invoice_logs: true,
                    description: true,
                    vendor: true,
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
              select: {
                id: true,
                category: true,
                description: true,
              },
            },
            complaints: true,
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
            order_history: {
              select: {
                order_id: true,
                created_at: true,
                status: {
                  select: {
                    id: true,
                    category: true,
                    description: true,
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
              where: {
                deleted_at: null,
                deleted_by: null,
              },
              include: {
                promotion: true,
                quotation_details: {
                  include: {
                    item: true,
                  },
                },
                quotation_files: true,
              },
            },
            work_orders: {
              where: {
                deleted_at: null,
              },
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
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.orders.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            created_at: order_by,
          },
          include: {
            members: {
              where: {
                deleted_at: null,
                deleted_by: null,
              },
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
                    invoice_logs: true,
                    description: true,
                    vendor: true,
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
              select: {
                id: true,
                category: true,
                description: true,
              },
            },
            complaints: true,
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
            order_history: {
              select: {
                order_id: true,
                created_at: true,
                status: {
                  select: {
                    id: true,
                    category: true,
                    description: true,
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
              where: {
                deleted_at: null,
                deleted_by: null,
              },
              include: {
                promotion: true,
                quotation_details: {
                  include: {
                    item: true,
                  },
                },
                quotation_files: true,
              },
            },
            work_orders: {
              where: {
                deleted_at: null,
              },
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
        dataExcel = [...dataExcel, ...data];
      }

      // Log data to verify it is fetched correctly
      // console.log('Fetched Data:', data);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order', {
        properties: {
          tabColor: {
            argb: 'FF00FF00',
          },
          outlineLevelCol: 2,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Order Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Order Dibuat ', key: 'created_at', width: 30 },
        { header: 'Tanggal Request Survey', key: 'request_survey', width: 30 },
        {
          header: 'Tanggal Permintaan Survey',
          key: 'surveyreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Survey Dimulai',
          key: 'surveystart_date',
          width: 30,
        },
        { header: 'Tanggal Survey Selesai', key: 'surveyend_date', width: 30 },
        {
          header: 'Tanggal Permintaan Pengerjaan',
          key: 'workreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Dimulai',
          key: 'workstart_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Berakhir',
          key: 'workend_date',
          width: 30,
        },
        { header: 'Nama Customer', key: 'full_name', width: 35 },
        { header: 'Alamat', key: 'address', width: 40 },
        { header: 'Nomor Telepon Customer', key: 'member_number', width: 35 },
        { header: 'Jenis Pengerjaan', key: 'payment_type', width: 30 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 40 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      dataExcel.forEach((order) => {
        const tukangName = order.work_orders
          ? order.work_orders.work_order_tukang
            .map((item) => item?.tukang?.full_name)
            .join(', ')
          : 'N/a';
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const row = worksheet.addRow({
          id: order.id,
          store_name: order.store ? order.store.store_name : 'N/a',
          full_name: order.members ? order.members.full_name : 'N/a',
          address: order.members.address_1
            ? order.members.address_1
            : order.members.address_2,
          member_number: order.members.phone_number
            ? order.members.phone_number
            : order.members.whatsapp_number,
          payment_type:
            order.payment_type === 'pemasangan_tanpa_survey'
              ? 'Pemasangan Tanpa Survey'
              : order.payment_type === 'survey'
                ? 'Survey'
                : order.payment_type === 'gratis'
                  ? 'Gratis'
                  : 'N/a',
          tukang_name: tukangName,
          created_at: formattedDateTime(order.created_at),
          request_survey: order.request_survey
            ? formattedDateTime(order.request_survey)
            : 'N/a',
          surveyreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyreq'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveyreq'),
              ).created_at,
            )
            : 'N/a',
          surveystart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveystart'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveystart'),
              ).created_at,
            )
            : 'N/a',
          surveyend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyend'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveyend'),
              ).created_at,
            )
            : 'N/a',
          workreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workreq'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workreq'),
              ).created_at,
            )
            : 'N/a',
          workstart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workstart'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workstart'),
              ).created_at,
            )
            : 'N/a',
          workend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workend'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workend'),
              ).created_at,
            )
            : 'N/a',
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/order';
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${basename(excelFilePath)}`,
        );

        const fileStream = createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataOrder-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }

  async quotationPdf(order_id: number, res: Response) {
    const quotation = await this.dbService.quotation.findFirst({
      where: {
        order_id: order_id,
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      },
      include: {
        promotion: true,
        quotation_files: true,
        quotation_details: {
          where: {
            deleted_at: null,
          },
          include: {
            category: true,
          },
        },
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
            members: true,
            vendor: true,
            work_orders: {
              include: {
                work_order_evidences: true,
                work_order_status: {
                  orderBy: {
                    id: 'desc',
                  },
                  include: {
                    work_order_items: {
                      orderBy: {
                        id: 'desc',
                      },
                    },
                  },
                },
                work_order_tukang: true,
                status: true,
              },
            },
          },
        },
        status: true,
        store: true,
      },
    });

    if (!quotation) {
      console.error('Quotation not found!');
      throw new NotFoundException('quotation not found!');
    }

    const message = await this.dbService.email_messages.findFirst({
      where: {
        is_active: true,
        email_type: MailType.QUOTATIONS,
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        id: true,
        title: true,
        cc: true,
        bcc: true,
        greetings: true,
        welcome_header: true,
        footer: true,
        is_active: true,
        terms_detail: {
          where: {
            deleted_at: null,
          },
          select: {
            id: true,
            email_messages_id: true,
            terms: true,
          },
        },
        information_detail: {
          where: {
            deleted_at: null,
          },
          select: {
            id: true,
            email_messages_id: true,
            information: true,
          },
        },
        email_message_image: {
          where: {
            deleted_at: null,
          },
        },
      },
    });
    if (!message) {
      console.error('Message not found!');
      throw new NotFoundException('message not found!');
    }

    const data = {
      quotation,
      order: quotation.order,
      apiUrl: this.configService.get<string>('API_URL'),
      message,
    };

    // console.log(data.message);

    const buffer = await this.pdfService.generatePotrait('quotation-pdf', data);
    res.setHeader('Content-Type', 'application/pdf');
    const customerName = quotation.order?.members?.full_name?.replace(/[^a-zA-Z0-9 ]/g, '') ?? 'Customer';
    const quotationFilename = `Quotation - ${customerName} - Order ID ${quotation.order_id}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${quotationFilename}"`);
    res.send(buffer);
  }

  async orderFollowUp(orderFollowUpDto: CreateOrderDto, user: users) {
    if (
      !orderFollowUpDto.order_follow_up ||
      !orderFollowUpDto.order_follow_up.length
    ) {
      throw new Error('Data follow-up tidak ditemukan.');
    }

    const { order_id } = orderFollowUpDto.order_follow_up[0];

    const existingFollowUps = await this.dbService.order_follow_up.findMany({
      where: { order_id },
    });

    const requestIds = new Set(
      orderFollowUpDto.order_follow_up.map((item) => item.id),
    );
    const existingIds = new Set(existingFollowUps.map((item) => item.id));

    const idsToDelete = [...existingIds].filter((id) => !requestIds.has(id));

    const deleteOperations = idsToDelete.map((id) =>
      this.dbService.order_follow_up.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: user.id },
      }),
    );

    const upsertOperations = orderFollowUpDto.order_follow_up.map((item) => {
      if (!item.order_id) {
        throw new NotFoundException(
          `Quotation with ID ${item.order_id} not found!`,
        );
      }
      // console.log('BOOLEAN CSI SURVEY', Boolean(item.csi_survey));
      // console.log('BOOLEAN CSI WORK', Boolean(item.csi_work));

      return this.dbService.order_follow_up.upsert({
        where: { id: item.id ?? 0, deleted_at: null },
        create: {
          csi_survey: Boolean(item.csi_survey),
          csi_work: Boolean(item.csi_work),
          description: item.description,
          orders: { connect: { id: item.order_id } },
          created_by: user.id,
        },
        update: {
          csi_survey: Boolean(item.csi_survey),
          csi_work: Boolean(item.csi_work),
          description: item.description,
          orders: { connect: { id: item.order_id } },
          updated_at: new Date(),
          updated_by: user.id,
        },
      });
    });

    const results = await this.dbService.$transaction([
      ...deleteOperations,
      ...upsertOperations,
    ]);

    return results;
  }

  async orderFollowUpPdf(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
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
      } = queryParams;

      const skip = page * take - take;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
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
                  {
                    vendor: {
                      company_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      phone_number: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      whatsapp_number: {
                        contains: search,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(is_promotion
            ? [
              {
                OR: [
                  {
                    AND: [
                      {
                        payment_type: 'gratis',
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        payment_type: 'pemasangan_tanpa_survey',
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        quotation: {
                          some: {
                            promotion_id: {
                              not: null,
                            },
                          },
                        },
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
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
          vendor_id
            ? {
              vendor: {
                id: vendor_id,
                deleted_at: null,
              },
            }
            : undefined,
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
                  work_order_tukang: {
                    some: {
                      tukang_id: tukang_id,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_invoice)
            ? [
              {
                invoice_details: {
                  none: {
                    deleted_at: null,
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_active_warranty)
            ? [
              {
                work_orders: {
                  work_order_status: {
                    some: {
                      status: {
                        category: 'WORKEND',
                      },
                      created_at: {
                        gte: sevenDaysAgo,
                      },
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
                          status: {
                            category: 'WORKEND',
                          },
                          created_at: {
                            lt: sevenDaysAgo,
                          },
                        },
                      },
                    },
                  },
                  {
                    complaints: {
                      some: {
                        deleted_at: null,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(Boolean(is_receipt)
            ? [
              {
                receipt_number: {
                  not: null,
                },
              },
            ]
            : []),
          ...(is_receipt_quotation
            ? [
              {
                quotation: {
                  some: {
                    receipt_quotation: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(promotion)
            ? [
              {
                quotation: {
                  some: {
                    promotion_id: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_used_warranty)
            ? [{ complaints: { some: { deleted_at: null } } }]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const orders = await this.dbService.orders.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
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
          order_follow_up: {
            where: {
              deleted_at: null,
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
            select: {
              id: true,
              category: true,
              description: true,
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
              sales: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
        },
      });

      const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
      const filename = `order-follow-up-${timestamp}.pdf`;

      const data = {
        orders,
      };

      const buffer = await this.pdfService.generate('order-follow-up', data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(buffer);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async orderExportExcelFollowUp(res: Response, queryParams: QueryParamsDto) {
    const {
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
      is_promotion,
    } = queryParams;

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
        vendor_id
          ? {
            vendor: {
              id: vendor_id,
              deleted_at: null,
            },
          }
          : undefined,
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
        ...(is_promotion
          ? [
            {
              OR: [
                {
                  AND: [
                    {
                      payment_type: 'gratis',
                    },
                    {
                      status: {
                        category: 'WORKEND',
                      },
                    },
                  ],
                },
                {
                  AND: [
                    {
                      quotation: {
                        some: {
                          promotion_id: {
                            not: null,
                          },
                        },
                      },
                    },
                    {
                      status: {
                        category: 'WORKEND',
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

    const count = await this.dbService.orders.count({
      where,
    });

    let dataExcel = [];
    const takeData = 900;
    let skipData = 0;
    const countTake = Math.floor(count / takeData);

    for (let i = 0; i < countTake; i++) {
      skipData = i * takeData;
      const data = await this.dbService.orders.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          created_at: order_by,
        },
        include: {
          order_follow_up: {
            where: {
              deleted_at: null,
            },
          },
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
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
            select: {
              id: true,
              category: true,
              description: true,
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
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
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
        },
      });
      dataExcel = [...dataExcel, ...data];
    }

    if (count != dataExcel.length) {
      const data = await this.dbService.orders.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          created_at: order_by,
        },
        include: {
          order_follow_up: {
            where: {
              deleted_at: null,
            },
          },
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
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
                  invoice_logs: true,
                  description: true,
                  vendor: true,
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
            select: {
              id: true,
              category: true,
              description: true,
            },
          },
          complaints: true,
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
          order_history: {
            select: {
              order_id: true,
              created_at: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
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
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
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
      dataExcel = [...dataExcel, ...data];
    }
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Data Order Follow Up', {
      properties: {
        tabColor: {
          argb: 'FF00FF00',
        },
        outlineLevelCol: 2,
        outlineLevelRow: 40,
      },
      pageSetup: {
        margins: {
          left: 90.7,
          right: 0.7,
          top: 0.75,
          bottom: 0.75,
          header: 0.3,
          footer: 0.3,
        },
      },
    });

    // Set columns and headers
    worksheet.columns = [
      { header: 'Order ID', key: 'id', width: 15 },
      { header: 'Tanggal Order', key: 'created_at', width: 20 },
      { header: 'Nama Toko', key: 'store_name', width: 20 },
      { header: 'Nama Customer', key: 'customer_name', width: 20 },
      { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
      { header: 'Status Order', key: 'status_description', width: 20 },
      { header: 'CSI Survei', key: 'csi_survey', width: 25 },
      { header: 'CSI Pengerjaan', key: 'csi_work', width: 25 },
      { header: 'Catatan', key: 'notes', width: 30 },
    ];
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0000FF' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    dataExcel.forEach((order: any) => {
      worksheet.addRow({
        id: order.id,
        created_at: new Date(order.created_at).toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        store_name: order.store.store_name,
        customer_name: order.members.full_name,
        item_name: order.m_order_details
          .map((item: any) => item.item_name)
          .join(', '),
        status_description: order.status.description,
        csi_survey:
          order.order_follow_up[0]?.csi_survey === true ? 'YES' : 'NO',
        csi_work: order.order_follow_up[0]?.csi_work === true ? 'YES' : 'NO',
        notes: order.order_follow_up[0]?.description || '-',
      });
    });

    const getFormattedDate = () => {
      const now = new Date();
      const tahun = now.getFullYear();
      const bulan = String(now.getMonth() + 1).padStart(2, '0');
      const tanggal = String(now.getDate()).padStart(2, '0');
      return `${tahun}-${bulan}-${tanggal}`;
    };

    const createExcelFilePath = (baseName: string) => {
      const folderPath = './storage/excel/order/follow-up';
      if (!existsSync(folderPath)) {
        mkdirSync(folderPath, { recursive: true });
      }
      const now = Date.now();

      const excelFileName = `${baseName}-${now}.xlsx`;
      return join(folderPath, excelFileName);
    };

    const writeWorkbookAndSendResponse = async (
      workbook: exceljs.Workbook,
      excelFilePath: string,
      res: Response,
    ) => {
      await workbook.xlsx.writeFile(excelFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${basename(excelFilePath)}`,
      );

      const fileStream = createReadStream(excelFilePath);
      fileStream.pipe(res);
    };

    const generateExcelFile = async (res) => {
      const formattedDate = getFormattedDate();
      const baseName = `DataOrderFollowUp-${formattedDate}`;
      const excelFilePath = createExcelFilePath(baseName);

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    };

    return await generateExcelFile(res);
  }

  async updateReceiptPublic(
    id: number,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      const { receipt_order, quotation_receipt_customer } = files;

      const receiptQuotationFileCustomer =
        quotation_receipt_customer?.map((file) => ({
          path: file.filename,
          type: 3,
        })) ?? [];

      const receiptOrderFiles =
        receipt_order?.map((file) => ({
          path: file.filename,
          type: 'any',
        })) ?? [];

      const order = await this.dbService.orders.findFirstOrThrow({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          quotation: {
            where: {
              deleted_at: null,
            },
          },
        },
      });

      const result = await this.dbService.$transaction([
        ...(receiptOrderFiles
          ? [
            this.dbService.orders.update({
              where: { id },
              data: {
                order_files:
                  receiptOrderFiles.length > 0
                    ? {
                      createMany: { data: receiptOrderFiles },
                    }
                    : undefined,
              },
              include: {
                quotation: true,
              },
            }),
          ]
          : []),
        ...(receiptQuotationFileCustomer
          ? [
            this.dbService.quotation.update({
              where: {
                id: order?.quotation[0]?.id,
              },
              data: {
                quotation_files: {
                  createMany: {
                    data: receiptQuotationFileCustomer,
                  },
                },
              },
            }),
          ]
          : []),
      ]);

      return result;
    } catch (error) {
      console.error('Error updating receipt public:', error);
      throw new Error('Failed to update receipt public');
    }
  }

  async deleteHistory(id: number) {
    try {
      const history = await this.dbService.order_histories.delete({
        where: {
          id: id,
        },
      });
      return history;
    } catch (error) {
      throw error;
    }
  }

  async createOrderPublic(dto: CreateOrderDto, memberDto: CreateMemberDto) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          store_name: {
            contains: dto.store_name,
          },
        },
      });

      const member = await this.dbService.members.findFirst({
        where: {
          deleted_at: null,
          email: memberDto?.email ?? undefined,
          full_name: memberDto?.full_name ?? undefined,
        },
      });

      let newMember;
      if (!member) {
        newMember = await this.dbService.members.create({
          data: {
            full_name: memberDto?.full_name ?? undefined,
            email: memberDto?.email ?? undefined,
            phone_number: memberDto?.phone_number ?? undefined,
            whatsapp_number: memberDto?.whatsapp_number ?? undefined,
            member_number:
              memberDto?.phone_number ?? memberDto?.whatsapp_number,
            address_1: memberDto?.address_1 ?? undefined,
            address_2: memberDto?.address_2 ?? undefined,
            area_id: memberDto?.area_id ?? undefined,
            zip_code: memberDto?.zip_code ?? undefined,
            join_date: new Date(),
            join_location: store?.id ?? undefined,
          },
        });
      }

      const requestedItemCodes = dto?.order_details?.map((x) => x?.item_code);

      const items = await this.dbService.items.findMany({
        where: {
          deleted_at: null,
          item_code: { in: requestedItemCodes },
        },
        include: {
          category: true,
          prices: {
            where: {
              periodic_start: { lte: new Date() },
              periodic_end: { gte: new Date() },
            },
          },
        },
      });

      const foundItemCodes = new Set(items.map((item) => item.item_code));
      const missingItems = requestedItemCodes.filter(
        (code) => !foundItemCodes.has(code),
      );

      if (missingItems.length > 0) {
        throw new NotFoundException(
          `Item tidak ditemukan: ${missingItems.join(', ')}`,
        );
      }

      const itemTypes = new Set(items.map((item) => item.type));
      if (itemTypes.size > 1) {
        throw new BadRequestException(
          'Tipe item berbeda ditemukan dalam daftar item yang diminta.',
        );
      }

      const itemType = items[0]?.type;
      let payment_type;
      switch (itemType) {
        case 1:
          payment_type = 'gratis';
          break;
        case 2:
          payment_type = 'pemasangan_tanpa_survey';
          break;
        case 3:
          payment_type = 'survey';
          break;
        default:
          throw new BadRequestException('Tipe item tidak valid.');
      }

      const bookedStatus = await this.dbService.status.findFirst({
        where: {
          category: 'BOOKED',
        },
      });

      let grand_total = 0;
      if (payment_type === 'survey') grand_total += 99000;

      const order_details: Prisma.m_order_detailsCreateManyOrderInput[] =
        dto.order_details.map((item) => {
          let total = 0;
          const currentItem = items.find(
            ({ item_code }) => item_code === item?.item_code,
          );
          const itemPrice =
            currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
              ?.price ??
            currentItem?.default_price ??
            0;

          if (payment_type === 'pemasangan_tanpa_survey') {
            total = Number(itemPrice) * item.quantity;
            grand_total += total;
          }

          return {
            item_id: currentItem?.id,
            item_name: currentItem?.service_name ?? currentItem?.item_name,
            item_code: currentItem?.item_code,
            quantity: item?.quantity,
            item_notes: item?.item_notes,
            unit_price: itemPrice,
            comission: 0,
            total,
          };
        });

      const orderConnection = Object.fromEntries(
        Object.entries({
          members: { connect: { id: member ? member.id : newMember.id } },
          store: { connect: { id: store.id } },
          status: { connect: { id: bookedStatus.id } },
        }).filter(([value]) => value !== undefined),
      );

      const orderData = {
        notes: dto?.notes ?? undefined,
        project_address: member ? member?.address_1 : newMember.address_1,
        project_number: member
          ? member?.phone_number ?? member?.whatsapp_number ?? undefined
          : newMember?.phone_number ?? newMember?.whatsapp_number ?? undefined,
        receipt_number: dto?.receipt_number ?? undefined,
        grand_total: grand_total.toFixed(2),
        payment_type, // Menggunakan `payment_type` yang di-set berdasarkan tipe item
        print_counter: 0,
        request_survey: new Date(dto?.request_survey),
      };

      const ordersOptions: Prisma.ordersCreateArgs = {
        data: {
          ...orderConnection,
          ...orderData,
          m_order_details: { createMany: { data: order_details } },
        },
        include: {
          status: true,
        },
      };

      const [order] = await this.dbService.$transaction([
        this.dbService.orders.create({
          data: {
            ...ordersOptions.data,
          },
          select: {
            id: true,
            member_id: true,
            members: {
              select: {
                id: true,
                full_name: true,
                email: true,
                phone_number: true,
                whatsapp_number: true,
                address_1: true,
                address_2: true,
                area_id: true,
                zip_code: true,
                join_date: true,
                join_location: true,
              },
            },
            store_id: true,
            store: {
              select: {
                id: true,
                store_name: true,
                address: true,
              },
            },
            receipt_number: true,
            project_address: true,
            project_number: true,
            m_order_details: {
              select: {
                id: true,
                item_id: true,
                item_name: true,
                item_code: true,
                item: {
                  select: {
                    item_code: true,
                    item_name: true,
                    service_name: true,
                    default_price: true,
                    prices: {
                      select: {
                        price: true,
                        min_order: true,
                      },
                    },
                  },
                },
                quantity: true,
                item_notes: true,
                unit_price: true,
                comission: true,
                total: true,
              },
            },
            request_survey: true,
            grand_total: true,
            project_status_id: true,
            status: {
              select: {
                id: true,
                category: true,
              },
            },
            work_orders: {
              include: {
                work_order_tukang: true,
              },
            },
            created_at: true,
          },
        }),
      ]);

      await this.whatsAppService.sendOrderCreatedNotification(order.id);

      return order;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
