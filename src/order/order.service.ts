/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
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
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { MailType } from 'src/mails/enum/mail_type.enum';
import { basename, join } from 'path';
import { PdfService } from 'src/common/service/pdf.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { CreateMemberDto } from 'src/member/dto/create-member.dto';
import { ConfigService } from '@nestjs/config';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OrderQueryService } from './order-query.service';
import { OrderPublicService } from './order-public.service';
import { OrderCalendarService } from './order-calendar.service';
import { OrderExportService } from './order-export.service';
import { OrderExportHoService } from './order-export-ho.service';
import { OrderPdfService } from './order-pdf.service';
import { OrderFollowUpService } from './order-followup.service';
import { OrderFollowUpExportService } from './order-followup-export.service';
import { OrderStatusService } from './order-status.service';
import { OrderSchedulerService } from './order-scheduler.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
    private notifService: NotificationsService,
    private configService: ConfigService,
    private violationDetector: ViolationDetectorService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly orderQueryService: OrderQueryService,
    private readonly orderPublicService: OrderPublicService,
    private readonly orderCalendarService: OrderCalendarService,
    private readonly orderExportService: OrderExportService,
    private readonly orderExportHoService: OrderExportHoService,
    private readonly orderPdfService: OrderPdfService,
    private readonly orderFollowUpService: OrderFollowUpService,
    private readonly orderFollowUpExportService: OrderFollowUpExportService,
    private readonly orderStatusService: OrderStatusService,
    private readonly orderSchedulerService: OrderSchedulerService,
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

      const validItemIds = (createOrderDto.order_details || [])
        .map((x) =>
          x?.item_id !== undefined && x?.item_id !== null
            ? Number(x.item_id)
            : null,
        )
        .filter((x): x is number => x !== null && !isNaN(x) && x > 0);

      const orderDetailItems =
        validItemIds.length > 0
          ? await this.dbService.items.findMany({
              where: {
                id: {
                  in: validItemIds,
                },
                deleted_at: null,
                is_active: true,
              },
              include: {
                category: true,
                prices: {
                  where: {
                    deleted_at: null,
                    is_active: true,
                    OR: [
                      { periodic_end: { gte: new Date() } },
                      { periodic_end: null },
                    ],
                  },
                },
              },
            })
          : [];

      if (validItemIds.length > 0 && orderDetailItems.length === 0)
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
          const parsedItemId =
            item?.item_id !== undefined && item?.item_id !== null
              ? Number(item.item_id)
              : null;
          const currentItem =
            parsedItemId && !isNaN(parsedItemId)
              ? orderDetailItems?.find(({ id }) => id === parsedItemId)
              : null;
          const itemPrice =
            currentItem?.prices?.filter((x) => item.quantity >= x.min_order)?.[0]
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
            total = Number(itemPrice) * Number(item.quantity || 1);
            grand_total += total;
            grand_total_comission += comission;
          }

          return {
            item_id:
              parsedItemId && !isNaN(parsedItemId) && parsedItemId > 0
                ? parsedItemId
                : null,
            item_code: item?.item_code ?? null,
            item_name: item?.item_name ?? null,
            item_notes: item?.item_notes ?? '',
            quantity: Number(item?.quantity) || 1,
            unit_price: itemPrice,
            created_by: user_id,
            total,
            comission,
            sales_id: salesUser?.sales[0]?.id ?? createOrderDto.sales_id,
          };
        });
      if (createOrderDto.is_overdistance == 1)
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
        ...(createOrderDto.is_overdistance == 1
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

        try {
          await this.emailQueue.add(
            'send-order-mail',
            {
              module_id: order.id,
              template_id: undefined,
            },
            {
              jobId: `send-order-mail-${order.id}-${order.project_status_id}`,
              attempts: 3,
              delay: 2000,
            },
          );
          this.logger.log(`Enqueued send-order-mail for order #${order.id}`);
        } catch (queueErr) {
          this.logger.error(`Failed to enqueue order mail for order #${order.id}: ${queueErr.message}`);
        }
      }

      await this.addHistory(
        order.id,
        order.project_status_id,
        user,
        createOrderDto,
      );

      return order;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(queryParams: any) {
    return this.orderQueryService.findAll(queryParams);
  }

  async findOne(id: number) {
    return this.orderQueryService.findOne(id);
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
                    deleted_at: null,
                    is_active: true,
                    OR: [
                      { periodic_end: { gte: new Date() } },
                      { periodic_end: null },
                    ],
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
                deleted_at: null,
                is_active: true,
                OR: [
                  { periodic_end: { gte: new Date() } },
                  { periodic_end: null },
                ],
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

      // Tentukan additional_fee efektif berdasarkan kondisi update:
      // - is_overdistance === 1 → pakai nilai baru (atau default 25000)
      // - is_overdistance === 0 → fee dihapus, jadi 0
      // - is_overdistance tidak dikirim (undefined) → pertahankan nilai lama dari DB
      const effectiveAdditionalFee =
        updateOrderDto.is_overdistance == 1
          ? Number(updateOrderDto.additional_fee ?? 25000)
          : updateOrderDto.is_overdistance == 0
            ? 0
            : Number(order.additional_fee ?? 0);

      if (
        ![PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY].includes(
          updateOrderDto?.payment_type,
        )
      ) {
        // Untuk tipe survey: grand_total = (grand_total lama - additional_fee lama) + additional_fee efektif
        // Ini memastikan additional_fee tidak double-count maupun hilang
        const baseTotal = Number(order.grand_total) - Number(order.additional_fee ?? 0);
        grand_total += baseTotal + effectiveAdditionalFee;
      } else {
        // Untuk PEMASANGAN_TANPA_SURVEY: grand_total dihitung ulang dari item,
        // additional_fee ditambahkan sekali di luar loop
        grand_total += effectiveAdditionalFee;
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
              // Hanya tambahkan total per item — additional_fee sudah dihitung
              // sekali di luar loop (lihat blok grand_total di atas)
              grand_total += total;
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
        // Jika is_overdistance === 1 → set fee baru (atau default 25000)
        // Jika is_overdistance === 0 → hapus fee (set 0)
        // Jika is_overdistance tidak dikirim (undefined) → jangan ubah field ini di DB
        ...(updateOrderDto?.is_overdistance == 1
          ? { additional_fee: updateOrderDto?.additional_fee ?? 25000 }
          : updateOrderDto?.is_overdistance == 0
            ? { additional_fee: 0 }
            : undefined),
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

        if (
          updateOrderDto?.project_status_id &&
          updateOrderDto.project_status_id !== order.project_status_id
        ) {
          try {
            await this.emailQueue.add(
              'send-order-mail',
              {
                module_id: orderQuery.id,
                template_id: undefined,
              },
              {
                jobId: `send-order-mail-${orderQuery.id}-${orderQuery.project_status_id}`,
                attempts: 3,
                delay: 2000,
              },
            );
            this.logger.log(
              `Enqueued send-order-mail for order #${orderQuery.id} status change to ${orderQuery.project_status_id}`,
            );
          } catch (queueErr) {
            this.logger.error(
              `Failed to enqueue order mail for order #${orderQuery.id}: ${queueErr.message}`,
            );
          }
        }
      }

      await this.addHistory(
        orderQuery.id,
        orderQuery.project_status_id,
        user,
        updateOrderDto,
      );

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

  async checkStatus() {
    return this.orderSchedulerService.checkStatus();
  }

  async deleteOrder() {
    return this.orderSchedulerService.deleteOrder();
  }

  async setStatus(id: number, status_id: number, user: users) {
    return this.orderStatusService.setStatus(id, status_id, user);
  }

  async addHistory(
    id: number,
    status_id: number,
    user: users,
    payload: any,
  ): Promise<void> {
    return this.orderStatusService.addHistory(id, status_id, user, payload);
  }

  async orderDetailsPublic(query: QueryParamsDto) {
    return this.orderPublicService.orderDetailsPublic(query);
  }

  async orderExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.orderExportService.orderExportExcel(res, queryParams);
  }

  async orderCalender(queryParams: QueryParamsDto) {
    return this.orderCalendarService.orderCalender(queryParams);
  }

  async orderExportExcelHO(res: Response, queryParams: QueryParamsDto) {
    return this.orderExportHoService.orderExportExcelHO(res, queryParams);
  }

  async quotationPdf(order_id: number, res: Response) {
    return this.orderPdfService.quotationPdf(order_id, res);
  }

  async orderFollowUp(orderFollowUpDto: CreateOrderDto, user: users) {
    return this.orderFollowUpService.orderFollowUp(orderFollowUpDto, user);
  }

  async orderFollowUpPdf(res: Response, queryParams: QueryParamsDto) {
    return this.orderFollowUpService.orderFollowUpPdf(res, queryParams);
  }

  async orderExportExcelFollowUp(res: Response, queryParams: QueryParamsDto) {
    return this.orderFollowUpExportService.orderExportExcelFollowUp(res, queryParams);
  }

  async updateReceiptPublic(
    id: number,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    return this.orderPublicService.updateReceiptPublic(id, files);
  }

  async deleteHistory(id: number) {
    return this.orderStatusService.deleteHistory(id);
  }

  async createOrderPublic(dto: CreateOrderDto, memberDto: CreateMemberDto) {
    return this.orderPublicService.createOrderPublic(dto, memberDto);
  }
}
