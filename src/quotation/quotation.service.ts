/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, quotation, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MarginType } from './dto/margin-type.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { WorkOrderMaterialType } from 'src/work_orders/dto/work-order-material-type.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class QuotationService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }

  private readonly logger = new Logger(QuotationService.name);

  async create(
    createQuotationDto: CreateQuotationDto,
    user: users,
    quotation_files?: Express.Multer.File[],
  ) {
    try {
      const { id: user_id } = user;
      let grandTotal = 0;
      let grandTotalNoPromotion = 0;

      const order = await this.dbService.orders.findFirst({
        where: {
          id: createQuotationDto.order_id,
        },
        include: {
          sales: true,
          vendor: true,
        },
      });

      if (!order)
        throw new BadRequestException(
          `Order with id ${createQuotationDto.order_id} not found!`,
        );

      const evidence: Array<Prisma.quotation_filesCreateManyQuotationInput> =
        quotation_files
          ? quotation_files.map((item) => ({
            path: item.filename,
            created_by: user_id,
          }))
          : undefined;

      const promotion = createQuotationDto.promotion_id
        ? await this.dbService.promotion.findFirst({
          where: {
            id: createQuotationDto.promotion_id,
            deleted_at: null,
          },
          include: {
            promotion_stores: {
              include: {
                store: true,
              },
            },
          },
        })
        : undefined;

      let quotaionDetails: Array<Prisma.quotation_detailsCreateManyQuotationInput> =
        createQuotationDto.quotation_details.map((item) => {
          const prices = Number(item?.is_customer ? 0 : item?.price ?? 0);
          const quantity = item.quantity;
          const margin =
            item.margin_type === MarginType.PERCENTAGE
              ? +item.margin <= 100
                ? prices * quantity * (+item.margin / 100)
                : 0
              : +item.margin;
          const final_price = prices * quantity + margin;

          if (
            createQuotationDto.quotation_special === 1 &&
            !item.work_step &&
            item.type === 2
          ) {
            throw new BadRequestException('Mohon untuk mengisi work step!');
          }

          grandTotal += final_price ?? 0;
          grandTotalNoPromotion += final_price ?? 0;
          return {
            category_id: item?.category_id,
            item_id: item?.item_id,
            item_type: item.type,
            margin: item.margin,
            margin_type: item.margin_type,
            description: item?.description,
            name: item.name,
            price: prices,
            unit: item.unit,
            quantity: quantity,
            work_order_items_id: item?.work_order_item_id,
            is_customer: Boolean(item.is_customer),
            work_step: item.work_step,
            final_price: final_price ?? 0,
          };
        });

      if (promotion) {
        if (promotion.promotion_type === 1) {
          grandTotal -= grandTotal * (Number(promotion.promotion) / 100);
        } else if (promotion.promotion_type === 2) {
          grandTotal -= Number(promotion.promotion);
        }
      }

      if (grandTotal > 20000000 && createQuotationDto.quotation_special === 1) {
        const workStepCounts = {
          1: quotaionDetails.filter(
            (detail) => detail.work_step === 1 && detail.item_type === 2,
          ).length,
          2: quotaionDetails.filter(
            (detail) => detail.work_step === 2 && detail.item_type === 2,
          ).length,
          3: quotaionDetails.filter(
            (detail) => detail.work_step === 3 && detail.item_type === 2,
          ).length,
        };

        quotaionDetails = quotaionDetails.map((detail) => {
          switch (detail.work_step) {
            case 1:
              detail.quotation_special_price =
                (grandTotal * 0.25) / workStepCounts[1];
              break;
            case 2:
              detail.quotation_special_price =
                (grandTotal * 0.5) / workStepCounts[2];
              break;
            case 3:
              detail.quotation_special_price =
                (grandTotal * 0.25) / workStepCounts[3];
              break;
            default:
              break;
          }
          return detail;
        });
      }

      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'QUOTEIN',
          },
        },
      });

      const quotation_data: Prisma.quotationCreateInput = {
        order: {
          connect: {
            id: createQuotationDto.order_id,
          },
        },
        ...(promotion
          ? {
            promotion: {
              connect: {
                id: promotion.id,
              },
            },
          }
          : undefined),
        store: {
          connect: {
            id: createQuotationDto.store_id,
          },
        },
        status: {
          connect: {
            id: status.id,
          },
        },
        description: createQuotationDto?.description ?? '',
        quotation_number: createQuotationDto.quotation_number,
        quotation_date: new Date(createQuotationDto.quotation_date),
        quotation_disc: createQuotationDto?.quotation_disc,
        quotation_promotion: createQuotationDto?.quotation_promotion,
        quotation_special: createQuotationDto.quotation_special,
        quotation_no_promotion: grandTotalNoPromotion,
        quotation_grand_total:
          grandTotal -
          (createQuotationDto.quotation_disc
            ? +createQuotationDto.quotation_disc
            : 0),
        created_by: user_id,
      };

      const quotation_options: Prisma.quotationCreateArgs = {
        data: {
          ...quotation_data,
          quotation_files: {
            createMany: {
              data: evidence,
            },
          },
          quotation_details: {
            createMany: {
              data: quotaionDetails,
            },
          },
        },
        include: {
          order: {
            include: {
              work_orders: {
                include: {
                  work_order_tukang: true,
                },
              },
            },
          },
        },
      };

      const [quotation] = await this.dbService.$transaction([
        this.dbService.quotation.create(quotation_options),
      ]);

      if (quotation) {
        await this.notifService.create(
          {
            quotation: quotation,
            orders: order,
          },
          'CREATE',
          quotation.created_by,
          moduleTypeNotification.QUOTATION,
          quotation.id,
          quotation.quotation_status,
        );
      }

      await this.orderService.setStatus(
        quotation.order_id,
        quotation.quotation_status,
        user,
      );
      return { quotation };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        vendor_id,
        store_id,
        promotion,
        is_free,
        is_paid,
      } = queryParamsDto;
      const skip = page * take - take;
      const where: Prisma.quotationWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : null,
          ...(search
            ? [
              {
                OR: [
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    order_id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    order: { vendor: { company_name: { contains: search } } },
                  },
                  {
                    quotation_details: {
                      some: {
                        name: {
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
                  { store: { store_name: { contains: search } } },
                  { quotation_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(is_free
            ? [
              {
                order: {
                  m_order_details: {
                    every: {
                      item: {
                        type: 1,
                      },
                    },
                  },
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
            : null,
          vendor_id
            ? {
              order: {
                vendor_id: vendor_id,
              },
            }
            : undefined,
          store_id
            ? {
              order: {
                store_id: store_id[0]
              }
            }
            : undefined,
          Boolean(is_paid)
            ? {
              receipt_quotation: {
                not: null,
              },
            }
            : undefined,
          ...(Boolean(promotion)
            ? [
              {
                promotion_id: {
                  not: null,
                },
              },
            ]
            : []),
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };
      const quotation = await this.dbService.quotation.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        orderBy: {
          created_at: order_by,
        },
        include: {
          quotation_follow_up: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          quotation_receipt: true,
          promotion: {
            where: {
              deleted_at: null,
            },
          },
          quotation_files: true,
          quotation_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              category: true,
              work_order_items: true,
            },
          },
          order: {
            include: {
              m_order_details: {
                where: {
                  deleted_at: null,
                },
              },
              status: true,
              vendor: true,
              store: true,
              members: true,
              sales: true,
              work_orders: {
                include: {
                  work_order_evidences: true,
                  work_order_status: {
                    include: {
                      work_order_items: {
                        orderBy: {
                          id: 'desc',
                        },
                      },
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
                  status: true,
                },
              },
            },
          },
          status: true,
          store: true,
        },
      });

      const quotationGrandTotal = await this.dbService.quotation
        .aggregate({
          where,
          _sum: {
            quotation_grand_total: true,
          },
        })
        .then((data) => data._sum.quotation_grand_total);
      const total = await this.dbService.quotation.count({
        where,
      });
      const userIds = [
        ...new Set(
          quotation
            .flatMap((item) => [
              item.created_by,
              item.updated_by,
              item.deleted_by,
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

      const quotationWithUser = quotation.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
      }));

      return {
        data: quotationWithUser,
        meta: {
          skip,
          take,
          page,
          takeTotal: quotation.length,
          quotationGrandTotal,
          total,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const quotation = await this.dbService.quotation.findFirst({
        where: {
          id,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
          quotation_follow_up: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          promotion: true,
          quotation_files: true,
          quotation_receipt: true,
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
              m_order_details: true,
              members: true,
              vendor: true,
              status: true,
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
      const userIds = [
        quotation.created_by,
        quotation.updated_by,
        quotation.deleted_by,
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the quotations
      const quotationsWithUser = {
        ...quotation,
        created_by: userMap[quotation.created_by] || null,
        updated_by: userMap[quotation.updated_by] || null,
        deleted_by: userMap[quotation.deleted_by] || null,
      };

      return quotationsWithUser;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateQuotationDto: UpdateQuotationDto,
    user: users,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      const { id: user_id } = user;
      const { quotation_files, quotation_receipts } = files;
      const quotationForUpdate = await this.dbService.quotation.findFirst({
        where: { id },
        include: { promotion: true, quotation_follow_up: true },
      });

      console.log('PAYLOAD', updateQuotationDto);

      const promotion =
        updateQuotationDto?.promotion_id || quotationForUpdate?.promotion_id
          ? await this.dbService.promotion.findFirstOrThrow({
            where: {
              id:
                updateQuotationDto?.promotion_id ??
                quotationForUpdate?.promotion?.id,
            },
          })
          : undefined;

      const quotationfiles =
        quotation_files?.map((item) => ({
          path: item.filename,
          type: 1,
          created_by: user_id,
        })) ?? [];

      const receiptfile =
        quotation_receipts?.map((file) => ({
          path: file.filename,
          type: 2,
          created_by: user_id,
        })) ?? [];

      const evidence = [...quotationfiles, ...receiptfile];

      const quotationReceipts: Prisma.quotation_receiptUpsertWithWhereUniqueWithoutQuotationInput[] =
        updateQuotationDto.receipts_quotation
          ? updateQuotationDto.receipts_quotation.map((item) => ({
            where: { id: item?.id ?? 0 },
            update: {
              receipt_quotation: item?.receipt_quotation ?? undefined,
              quotation_step: item?.quotation_step ?? undefined,
            },
            create: {
              receipt_quotation: item?.receipt_quotation,
              quotation_step: item?.quotation_step,
            },
          }))
          : [];

      if (
        updateQuotationDto.receipt_quotation &&
        updateQuotationDto.receipt_quotation != 'null'
      ) {
        const existingQuotation = await this.dbService.quotation.findFirst({
          where: {
            id: { not: id },
            receipt_quotation: updateQuotationDto.receipt_quotation,
          },
        });

        if (existingQuotation) {
          throw new BadRequestException(
            `No Receipt "${updateQuotationDto.receipt_quotation}" already exists!`,
          );
        }
      }

      if (
        updateQuotationDto.receipts_quotation &&
        updateQuotationDto.receipts_quotation.length > 0
      ) {
        const receiptNumbers = updateQuotationDto.receipts_quotation
          .map((item) => item.receipt_quotation)
          .filter((item) => item !== undefined);


        const duplicates = receiptNumbers.filter(
          (item, index) => receiptNumbers.indexOf(item) !== index,
        );

        if (duplicates.length > 0) {
          throw new BadRequestException(
            `Duplicate receipt number(s) found: ${duplicates.join(', ')}`,
          );
        }

        const existingQuotation = await this.dbService.quotation.findMany({
          where: {
            id: { not: id },
            quotation_receipt: {
              some: {
                receipt_quotation: { in: receiptNumbers },
              },
            },
          },
          include: {
            quotation_receipt: true,
          },
        });

        if (existingQuotation.length > 0) {
          const existingReceipts = existingQuotation
            .map((quotation) =>
              quotation.quotation_receipt.map(
                (receipt) => receipt.receipt_quotation,
              ),
            )
            .flat();

          const conflictReceipts = receiptNumbers.filter((receipt) =>
            existingReceipts.includes(receipt),
          );

          if (conflictReceipts.length > 0) {
            throw new BadRequestException(
              `Receipt numbers ${conflictReceipts.join(', ')} already exist!`,
            );
          }
        }
      }

      let grandTotal = 0;
      let grandTotalNoPromotion = 0;
      const updatedQuotationDetails = updateQuotationDto.quotation_details.map(
        (item, i) => {
          let price = 0;
          const quantity = item.quantity ? Number(item.quantity) : 0;
          let final_price = 0;

          if (!item.is_customer && item.is_customer !== undefined) {
            price = Number(item.price);
            final_price =
              price * quantity +
              (item.margin_type === MarginType.PERCENTAGE
                ? price * quantity * (+item.margin / 100)
                : +item.margin);
          }
          console.log(`PRICE${[i]}`, price);

          grandTotal += final_price;
          grandTotalNoPromotion += final_price;

          return {
            where: {
              quotation_id: id,
              id: item?.id ?? 0,
            },
            update: {
              category_id: item?.category_id,
              item_id: item?.item_id,
              item_type: item?.type,
              description: item?.description,
              name: item?.name,
              price,
              unit: item.unit,
              quantity,
              margin: item?.margin,
              margin_type: item?.margin_type,
              quotation_special_price: 0,
              final_price,
              work_order_items_id: item?.work_order_item_id,
              work_step: item?.work_step,
              is_customer: Boolean(item.is_customer),
              updated_at: new Date(),
              updated_by: user_id,
            },
            create: {
              category_id: item?.category_id,
              item_id: item?.item_id,
              item_type: item?.type,
              description: item?.description,
              quotation_special_price: 0,
              name: item?.name,
              unit: item.unit,
              price: item?.price,
              quantity: item?.quantity,
              margin: item?.margin,
              margin_type: item?.margin_type,
              work_order_items_id: item?.work_order_item_id,
              work_step: item?.work_step,
              is_customer: Boolean(item.is_customer),
              final_price,
              created_by: user_id,
            },
          };
        },
      );

      if (promotion) {
        if (promotion.promotion_type === 1) {
          grandTotal -= grandTotal * (Number(promotion.promotion) / 100);
        } else if (promotion.promotion_type === 2) {
          grandTotal -= Number(promotion.promotion);
        }
      }

      if (
        (grandTotal > 20000000 && updateQuotationDto.quotation_special === 1) ||
        quotationForUpdate.quotation_special === 1
      ) {
        const workStepCounts = {
          1: updatedQuotationDetails.filter(
            (detail) =>
              detail.update.work_step === 1 || detail.create.work_step === 1,
          ).length,
          2: updatedQuotationDetails.filter(
            (detail) =>
              detail.update.work_step === 2 || detail.create.work_step === 2,
          ).length,
          3: updatedQuotationDetails.filter(
            (detail) =>
              detail.update.work_step === 3 || detail.create.work_step === 3,
          ).length,
        };

        updatedQuotationDetails.forEach((detail) => {
          if (
            detail.update.work_step === 1 ||
            (detail.create.work_step === 1 &&
              (detail.create.item_type === WorkOrderMaterialType.MATERIAL ||
                detail.update.item_type === WorkOrderMaterialType.MATERIAL))
          ) {
            const share = (grandTotal * 0.25) / workStepCounts[1];
            detail.update.quotation_special_price =
              detail.create.quotation_special_price = share;
          } else if (
            detail.update.work_step === 2 ||
            (detail.create.work_step === 2 &&
              (detail.create.item_type === WorkOrderMaterialType.MATERIAL ||
                detail.update.item_type === WorkOrderMaterialType.MATERIAL))
          ) {
            const share = (grandTotal * 0.5) / workStepCounts[2];
            detail.update.quotation_special_price =
              detail.create.quotation_special_price = share;
          } else if (
            detail.update.work_step === 3 ||
            (detail.create.work_step === 3 &&
              (detail.create.item_type === WorkOrderMaterialType.MATERIAL ||
                detail.update.item_type === WorkOrderMaterialType.MATERIAL))
          ) {
            const share = (grandTotal * 0.25) / workStepCounts[3];
            detail.update.quotation_special_price =
              detail.create.quotation_special_price = share;
          }
        });
      }

      const quoteOutStatus = await this.dbService.status.findFirst({
        where: {
          category: 'QUOTEOUT',
        },
      });

      const quotePaid = await this.dbService.status.findMany({
        where: {
          category: {
            in: ['QUOTATIONPAID', 'QUOTATIONPAIDSTEPTHREE'],
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [syncFiles, syncDetails, quotation] = await this.dbService.$transaction([
        this.dbService.quotation_files.updateMany({
          where: {
            quotation_id: id,
            id: {
              notIn: updateQuotationDto.preserve_files,
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.quotation_details.updateMany({
          where: {
            quotation_id: id,
            id: {
              notIn: updateQuotationDto.quotation_details
                .filter((x) => Boolean(x?.id))
                .map((item) => item.id),
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.quotation.update({
          where: { id },
          data: {
            ...(promotion
              ? {
                promotion: {
                  connect: {
                    id:
                      updateQuotationDto?.promotion_id ??
                      quotationForUpdate.promotion_id,
                  },
                },
              }
              : updateQuotationDto.promotion_id === 0
                ? {
                  promotion: {
                    disconnect: true,
                  },
                }
                : undefined),
            status: updateQuotationDto?.quotation_status && {
              connect: { id: updateQuotationDto.quotation_status },
            },
            receipt_quotation: updateQuotationDto?.receipt_quotation,
            description: updateQuotationDto?.description ?? undefined,
            readiness: updateQuotationDto?.readiness ?? undefined,
            quotation_special:
              updateQuotationDto?.quotation_special ?? undefined,
            quotation_number: updateQuotationDto?.quotation_number ?? undefined,
            quotation_date: updateQuotationDto?.quotation_date
              ? new Date(updateQuotationDto?.quotation_date)
              : undefined,
            ...(updateQuotationDto?.quotation_status === quoteOutStatus.id
              ? {
                quotation_validity: new Date(
                  Date.now() + 8 * 24 * 60 * 60 * 1000,
                ),
              }
              : undefined),
            quotation_disc: updateQuotationDto?.quotation_disc,
            quotation_promotion: updateQuotationDto?.quotation_promotion,
            quotation_no_promotion: grandTotalNoPromotion,
            ...(updateQuotationDto.store_id ? {
              store: {
                connect: {
                  id: updateQuotationDto.store_id
                }
              }
            } : undefined),
            quotation_grand_total:
              grandTotal -
              ((updateQuotationDto.quotation_disc
                ? +updateQuotationDto.quotation_disc
                : 0) +
                (updateQuotationDto.quotation_promotion
                  ? +updateQuotationDto.quotation_promotion
                  : 0)),
            updated_by: user_id,
            updated_at: new Date(),
            quotation_files: quotation_files || quotation_receipts
              ? { createMany: { data: evidence } }
              : undefined,
            quotation_details: { upsert: updatedQuotationDetails },
            ...(quotationForUpdate.quotation_special === 1 &&
              quotationReceipts.length && {
              quotation_receipt: { upsert: quotationReceipts },
            }),
            ...(updateQuotationDto?.quotation_status ===
              quotePaid.find(
                (x) =>
                  x.category === 'QUOTATIONPAIDSTEPTHREE' || 'QUOTATIONPAID',
              ).id && quotationForUpdate.quotation_follow_up.length
              ? {
                quotation_follow_up: {
                  updateMany: {
                    where: {
                      quotation_id: id,
                    },
                    data: {
                      is_done: true,
                      updated_at: new Date(),
                      updated_by: user_id,
                    },
                  },
                },
              }
              : undefined),
          },
          include: {
            status: true,
            order: {
              include: {
                work_orders: {
                  include: {
                    work_order_tukang: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      if (quotation) {
        await this.notifService.create(
          {
            quotation: quotation,
            orders: quotation.order,
          },
          'UPDATE',
          quotation.updated_by,
          moduleTypeNotification.QUOTATION,
          quotation.id,
          quotation.quotation_status,
        );
      }

      const existingIncentive = await this.dbService.sales_incentive.findFirst({
        where: { quotation_id: id },
      });

      if (
        (!existingIncentive && quotation.status.category === 'QUOTATIONPAID') ||
        quotation.status.category === 'QUOTATIONPAIDSTEPTHREE' || quotation.status.category === 'QUOTATIONPAIDSTEPTWO' || quotation.status.category === 'QUOTATIONPAIDSTEPONE'
      ) {
        console.log('INCENTIVE[START]');
        await this.generateSalesIncentive(
          Number(quotation.quotation_grand_total),
          quotation.store_id,
          quotation.order.sales_id,
          quotation,
        );
      }

      await this.orderService.setStatus(
        quotation.order_id,
        quotation.quotation_status,
        user,
      );

      return quotation;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.quotation.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async getCode() {
    try {
      const quotation = await this.dbService.quotation.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return quotation[0] || null;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async setStatus(id: number, status_id: number, user: users) {
    const { id: user_id } = user;
    const status = await this.dbService.status.findFirst({
      where: {
        id: status_id,
      },
    });
    if (!status) throw new BadRequestException('Status Id not found!');

    const quotationFind = await this.dbService.quotation.findFirst({
      where: {
        id,
      },
      include: {
        status: true,
      },
    });

    if (!quotationFind) throw new BadRequestException('Quotation not found!');
    // if (quotationFind.status.category.toLowerCase().includes('quoteout'))
    //   throw new BadRequestException('Cannot change status!');

    const quotation = await this.dbService.quotation.update({
      where: {
        id,
      },
      data: {
        quotation_status: status.id,
        updated_at: new Date(),
        updated_by: user_id,
      },
    });

    return quotation;
  }

  async incentiveDuplicate(id: number) {
    try {
      const incentives = await this.dbService.sales_incentive.findMany({
        where: { quotation_id: id },
        orderBy: { created_at: 'desc' },
        include: {
          incentive: true,
          quotation: true,
        },
      });

      console.log("INCENTIVE", incentives.length);


      if (incentives.length > 1) {
        const incentiveToKeep = incentives[0];
        let comission = 0;
        if (incentiveToKeep.incentive.type === 1) {
          comission +=
            Number(incentiveToKeep.quotation.quotation_grand_total) *
            (Number(incentiveToKeep.incentive.incentive) / 100);
        } else if (incentiveToKeep.incentive.type === 2) {
          comission += Number(incentiveToKeep.incentive.incentive);
        }

        const idsToDelete = incentives
          .filter((incentive) => incentive.id !== incentiveToKeep.id)
          .map((incentive) => incentive.id);

        await this.dbService.sales_incentive.deleteMany({
          where: { id: { in: idsToDelete } },
        });

        await this.dbService.sales_incentive.update({
          where: { id: incentiveToKeep.id },
          data: {
            nominal: comission,
          },
        });

        console.log(
          `Deleted ${idsToDelete.length} incentives for quotation_id=${id}, kept one.`,
        );
      } else if (incentives.length === 1) {
        const incentiveToKeep = incentives[0];
        let comission = 0;
        if (incentiveToKeep.incentive.type === 1) {
          comission +=
            Number(incentiveToKeep.quotation.quotation_grand_total) *
            (Number(incentiveToKeep.incentive.incentive) / 100);
        } else if (incentiveToKeep.incentive.type === 2) {
          comission += Number(incentiveToKeep.incentive.incentive);
        }

        console.log("COMISSION", comission);


        await this.dbService.sales_incentive.update({
          where: { id: incentiveToKeep.id },
          data: {
            nominal: comission,
          },
        });
      } else {
        console.log('No incentives found for the given quotation_id.');
      }
    } catch (error) {
      console.log(error);

      throw error;
    }
  }

  async updatePromotionQuotation() {
    try {
      const quotationNoPromotion = await this.dbService.quotation.findMany({
        where: {
          quotation_grand_total: {
            gte: 2000000
          },
          promotion_id: null
        }
      });

      const promotions = await this.dbService.promotion.findFirst({
        where: {
          deleted_at: null,
          min_order: {
            gte: 2000000
          }
        }
      });

      if (promotions) {
        const updateQuotation = await Promise.all(
          quotationNoPromotion.map(async (quotation) => {
            const discountAmount =
              promotions.promotion_type === 1
                ? Number(quotation.quotation_grand_total) * (Number(promotions.promotion) / 100)
                : Number(promotions.promotion);

            return this.dbService.quotation.update({
              where: { id: quotation.id },
              data: {
                promotion_id: promotions.id,
                quotation_grand_total: Number(quotation.quotation_grand_total) - discountAmount,
              },
            });
          })
        );

        return updateQuotation;
      }

      return { message: "No promotions available" };


      return 'Gagal';
    } catch (error) {
      console.error();
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkvalidity() {
    try {
      console.log('init checkvalidity');
      this.logger.log('init checkvalidity');
      const quotations = await this.dbService.quotation.findMany({
        where: {
          status: {
            category: {
              contains: 'QUOTEOUT',
            },
          },
          OR: [
            { quotation_receipt: { every: { receipt_quotation: null } } },
            { receipt_quotation: null },
          ],
          quotation_validity: {
            lte: new Date(),
          },
        },
        include: {
          order: true,
        },
      });

      console.log(`Found ${quotations.length} quotations`);

      if (!quotations.length) {
        console.log('No quotation found');
        this.logger.log('No quotation found');
        return 0;
      }

      console.log(`${quotations.length} quotation found`);
      this.logger.log(`${quotations.length} quotation found`);

      const NEWSTATUS = await this.dbService.status.findFirst({
        where: {
          category: {
            in: ['CLOSED'],
          },
        },
      });

      await Promise.all(
        quotations.map(async (quotation) => {
          const { id } = quotation;
          console.log(`Updating quotation ${id}`);

          // Update the quotation status
          await this.dbService.quotation.update({
            where: {
              id,
            },
            data: {
              quotation_status: NEWSTATUS.id,
            },
          });

          await this.notifService.create(
            {
              quotation: quotation,
              orders: quotation.order,
            },
            'UPDATE',
            quotation.updated_by,
            moduleTypeNotification.QUOTATION,
            quotation.id,
            quotation.quotation_status,
          );

        }),
      );

      await this.dbService.sales_incentive.updateMany({
        where: {
          quotation: {
            order: {
              refund: {
                some: {}
              }
            }
          }
        },
        data: {
          status: IncentiveStatus.LOST_INCENTIVE,
          updated_at: new Date()
        }
      })

      console.log('Finished checkvalidity');
      return 1;
    } catch (error) {
      console.error(error);
      this.logger.error(error);
      throw error;
    }
  }

  async quotationFollowUp(
    quotationFollowUpDto: CreateQuotationDto,
    user: users,
  ) {
    if (
      !quotationFollowUpDto.quotation_follow_up ||
      !quotationFollowUpDto.quotation_follow_up.length
    ) {
      throw new Error('Data follow-up tidak ditemukan.');
    }

    const { quotation_id } = quotationFollowUpDto.quotation_follow_up[0];

    const existingFollowUps = await this.dbService.quotation_follow_up.findMany(
      {
        where: { quotation_id },
      },
    );

    const requestIds = new Set(
      quotationFollowUpDto.quotation_follow_up.map((item) => item.id),
    );
    const existingIds = new Set(existingFollowUps.map((item) => item.id));

    const idsToDelete = [...existingIds].filter((id) => !requestIds.has(id));

    const deleteOperations = idsToDelete.map((id) =>
      this.dbService.quotation_follow_up.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: user.id },
      }),
    );

    const upsertOperations = quotationFollowUpDto.quotation_follow_up.map(
      (item) => {
        if (!item.quotation_id) {
          throw new NotFoundException(
            `Quotation with ID ${item.quotation_id} not found!`,
          );
        }

        return this.dbService.quotation_follow_up.upsert({
          where: { id: item.id ?? 0, deleted_at: null },
          create: {
            follow_up_1: Boolean(item.follow_up_1),
            follow_up_2: Boolean(item.follow_up_2),
            follow_up_3: Boolean(item.follow_up_3),
            description: item.description,
            quotation: { connect: { id: item.quotation_id } },
            created_by: user.id,
          },
          update: {
            follow_up_1: Boolean(item.follow_up_1),
            follow_up_2: Boolean(item.follow_up_2),
            follow_up_3: Boolean(item.follow_up_3),
            description: item.description,
            quotation: { connect: { id: item.quotation_id } },
            updated_at: new Date(),
            updated_by: user.id,
          },
        });
      },
    );

    const results = await this.dbService.$transaction([
      ...deleteOperations,
      ...upsertOperations,
    ]);

    return results;
  }

  async quotationExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        search,
        status,
        date_from,
        date_to,
        order_by,
        is_free,
        promotion,
        store_id
      } = queryParams;
      const where: Prisma.quotationWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : null,
          ...(search
            ? [
              {
                OR: [
                  {
                    order: { vendor: { company_name: { contains: search } } },
                  },
                  { store: { store_name: { contains: search } } },
                  { quotation_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(is_free
            ? [
              {
                order: {
                  m_order_details: {
                    every: {
                      item: {
                        type: 1,
                      },
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(promotion)
            ? [
              {
                promotion_id: {
                  not: null,
                },
              },
            ]
            : []),
          ...(store_id ? [{
            order: {
              store_id: {
                in: store_id
              }
            }
          }] : []),
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : null,
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };
      const count = await this.dbService.quotation.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;
        const data = await this.dbService.quotation.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            created_at: order_by,
          },
          include: {
            promotion: true,
            quotation_files: true,
            quotation_details: {
              include: {
                category: true,
                work_order_items: {
                  where: {
                    deleted_at: null,
                  },
                },
              },
            },
            order: {
              include: {
                m_order_details: {
                  where: {
                    deleted_at: null,
                  },
                },
                vendor: true,
                store: true,
                members: true,
                sales: true,
                work_orders: {
                  include: {
                    work_order_evidences: true,
                    work_order_status: {
                      where: {
                        deleted_at: null,
                      },
                      include: {
                        work_order_items: {
                          orderBy: {
                            id: 'desc',
                          },
                        },
                      },
                    },
                    work_order_tukang: {
                      include: {
                        tukang: true,
                      },
                    },
                    status: true,
                  },
                },
              },
            },
            status: true,
            store: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.quotation.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            created_at: order_by,
          },
          include: {
            promotion: true,
            quotation_files: true,
            quotation_details: {
              include: {
                category: true,
                work_order_items: {
                  where: {
                    deleted_at: null,
                  },
                },
              },
            },
            order: {
              include: {
                order_history: {},
                m_order_details: {
                  where: {
                    deleted_at: null,
                  },
                },
                vendor: true,
                store: true,
                members: true,
                sales: true,
                work_orders: {
                  include: {
                    work_order_evidences: true,
                    work_order_status: {
                      where: {
                        deleted_at: null,
                      },
                      include: {
                        work_order_items: {
                          orderBy: {
                            id: 'desc',
                          },
                        },
                      },
                    },
                    work_order_tukang: {
                      include: {
                        tukang: true,
                      },
                    },
                    status: true,
                  },
                },
              },
            },
            status: true,
            store: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Quotation', {
        properties: {
          tabColor: {
            argb: '097969',
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
        { header: 'Quotation Id', key: 'id', width: 25 },
        { header: 'Order Id', key: 'order_id', width: 25 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Quotation Dibuat ', key: 'created_at', width: 30 },
        { header: 'Nama Customer', key: 'member_name', width: 40 },
        { header: 'Status Quotation', key: 'status_quotation', width: 30 },
        { header: 'Status Payment', key: 'status_payment', width: 30 },
        { header: 'Nama Vendor', key: 'company_name', width: 30 },
        { header: 'Request Pengerjaan', key: 'request_work', width: 30 },
        { header: 'Tipe', key: 'item_type', width: 30 },
        { header: 'Jenis Jasa', key: 'item_name', width: 50 },
        { header: 'Quantity Jasa', key: 'item_quantity', width: 50 },
        { header: 'Unit Jasa', key: 'item_unit', width: 50 },
        {
          header: 'Material yang Dibutuhkan',
          key: 'work_order_items',
          width: 50,
        },
        {
          header: 'Quantity Material',
          key: 'work_order_items_quantity',
          width: 50,
        },
        { header: 'Unit Material', key: 'work_order_items_unit', width: 50 },
        { header: 'Tanggal Quotation', key: 'quotation_date', width: 50 },
        {
          header: 'Batas Tanggal Quotation',
          key: 'quotation_validity',
          width: 50,
        },
        { header: 'Nama Sales', key: 'sales_name', width: 35 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
        { header: 'Nama Promosi', key: 'promotion_tier', width: 30 },
        { header: 'Nominal Promosi', key: 'promotion_nominal', width: 30 },
        { header: 'Total Quotation', key: 'grand_total', width: 25 },
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

      dataExcel.forEach((quotation) => {
        let isFirstDetail = true;
        quotation.quotation_details.forEach((detail) => {
          const stepDescription =
            detail.work_step && detail.work_step > 0
              ? `(TAHAP ${detail.work_step})`
              : '';

          const specialStepDescription =
            quotation.quotation_special === 1 ? stepDescription : '';

          const itemName = `${detail?.name ?? 'Item tidak ditulis'
            } ${stepDescription}`;

          const itemQuantity = `${detail?.quantity ?? '1'
            } ${specialStepDescription}`;

          const itemUnit = `${detail?.unit ?? 'Satuan tidak tersedia'
            } ${specialStepDescription}`;

          const statusPayment = quotation?.receipt_quotation
            ? 'Dibayar'
            : 'Belum Dibayar';

          const tukangName = quotation?.order?.work_orders?.work_order_tukang
            ? Array.from(
              new Set(
                quotation.order.work_orders.work_order_tukang.map(
                  (item) => item?.tukang?.full_name,
                ),
              ),
            ).join(', ')
            : 'Tukang belum ditugaskan';

          const workOrderItems =
            detail?.work_order_items?.name ?? 'Material tidak ditambahkan';

          const workOrderItemsQuantity =
            detail?.work_order_items?.quantity ?? 'Material tidak ditambahkan';

          const workOrderItemsUnit =
            detail?.work_order_items?.unit ?? 'Material tidak ditambahkan';

          const formattedDateTime = (dateTime) =>
            `${new Date(dateTime).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}, ${dateTime.toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}`;

          const grandTotal = Number(quotation.quotation_grand_total);
          const formattedGrandTotal = !isNaN(grandTotal)
            ? Number(grandTotal)
            : 0;

          const row = worksheet.addRow({
            id: quotation.id,
            order_id: quotation.order ? quotation.order.id : '-',
            store_name: quotation.order.store
              ? quotation.order.store.store_name
              : 'N/a',
            created_at: formattedDateTime(quotation.created_at),
            member_name: quotation.order.members
              ? quotation.order.members.full_name
              : '-',
            status_quotation: quotation.status.description,
            status_payment: statusPayment,
            company_name: quotation?.order?.vendor
              ? quotation.order.vendor.company_name
              : 'N/a',
            request_work: quotation.order.request_work
              ? formattedDateTime(quotation.order.request_work)
              : 'Tanggal Belum Ditentukan',
            item_type: detail.item_type === 2 ? 'JASA' : 'MATERIAL',
            item_name: itemName,
            item_quantity: itemQuantity,
            item_unit: itemUnit,
            work_order_items: workOrderItems,
            work_order_items_quantity: workOrderItemsQuantity,
            work_order_items_unit: workOrderItemsUnit,
            quotation_date: quotation.quotation_date
              ? formattedDateTime(quotation.quotation_date)
              : 'Tanggal quotation belum ditentukan',
            quotation_validity: quotation.quotation_validity
              ? formattedDateTime(quotation.quotation_validity)
              : 'Tanggal validasi quotation belum ditentukan',
            sales_name: quotation.order.sales
              ? quotation.order.sales.full_name
              : 'N/a',
            tukang_name: tukangName,
            promotion_tier: quotation?.promotion
              ? quotation.promotion.name
              : '-',
            promotion_nominal:
              quotation?.promotion?.promotion_type === 1
                ? `${Number(quotation?.promotion?.promotion || 0)}%`
                : Number(quotation?.promotion?.promotion || 0),
            grand_total: isFirstDetail ? formattedGrandTotal : 0,
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
          isFirstDetail = false;
        });
      });

      const totalGrandTotal = dataExcel.reduce(
        (total, order) => total + Number(order.quotation_grand_total),
        0,
      );
      const formattedTotalGrandTotal = Number(totalGrandTotal);
      const totalRow = worksheet.addRow({
        id: 'Total',
        order_id: '',
        store_name: '',
        created_at: '',
        member_name: '',
        status_quotation: '',
        status_payment: '',
        company_name: '',
        request_work: '',
        item_type: '',
        item_name: '',
        item_quantity: '',
        item_unit: '',
        work_order_items: '',
        work_order_items_quantity: '',
        work_order_items_unit: '',
        quotation_date: '',
        quotation_validity: '',
        sales_name: '',
        tukang_name: '',
        promotion_tier: '',
        promotion_nominal: '',
        grand_total: formattedTotalGrandTotal,
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

      worksheet.mergeCells(`A${totalRow.number}:V${totalRow.number}`);

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/quotation';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
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
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataQuotation-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }

  private async generateSalesIncentive(
    grandTotal: number,
    storeId: number,
    salesId: number,
    quotation: quotation,
  ) {
    const { id: quotation_id, order_id, quotation_status } = quotation;

    // Mengambil status dari database
    const statusList = await this.dbService.status.findMany({
      select: {
        id: true,
        category: true,
        description: true,
      }
    });

    const stepTwoStatus = statusList.find(item => item.description === 'QUOTATIONPAIDSTEPTWO')?.id;
    const stepThreeStatus = statusList.find(item => item.description === 'QUOTATIONPAIDSTEPTHREE')?.id;

    if (quotation_status === stepTwoStatus || quotation_status === stepThreeStatus) {
      grandTotal *= 0.5;
    }

    console.log("GRAND TOTAL", grandTotal);
    console.log("STORE ID", storeId);

    const filteredIncentive = await this.dbService.setting_incentive.findMany({
      where: {
        deleted_at: null,
        stores: {
          some: { store_id: storeId },
        },
        min_order: { lte: grandTotal },
        max_order: { gte: grandTotal },
      },
    });


    console.log("INCENTIVE FILTER", filteredIncentive);

    const closestIncentive =
      filteredIncentive.length > 0
        ? filteredIncentive.reduce((closest, current) =>
          Math.abs(Number(current.min_order) - grandTotal) <
            Math.abs(Number(closest.min_order) - grandTotal)
            ? current
            : closest,
        )
        : null;

    console.log("INCENTIVE CLOSEST", closestIncentive);
    if (!closestIncentive) {
      return null;
    }

    if (!closestIncentive) return null;

    let comission = 0;
    if (closestIncentive.type === 1) {
      comission += grandTotal * (Number(closestIncentive.incentive) / 100);
    } else if (closestIncentive.type === 2) {
      comission += Number(closestIncentive.incentive);
    }

    const salesIncentive = await this.dbService.sales_incentive.create({
      data: {
        incentive: {
          connect: {
            id: closestIncentive.id,
          },
        },
        sales: {
          connect: {
            id: salesId,
          },
        },
        quotation: {
          connect: {
            id: quotation_id,
          },
        },
        nominal: Math.floor(comission),
        status: IncentiveStatus.POTENTIAL_INCENTIVE,
        created_by: quotation.updated_by,
      },
      include: {
        quotation: {
          include: {
            order: true,
          },
        },
      },
    });

    if (salesIncentive) {
      await this.notifService.create(
        {
          sales_incentive: salesIncentive,
          orders: salesIncentive.quotation.order,
        },
        'CREATE',
        salesIncentive.created_by,
        moduleTypeNotification.INCENTIVE,
        salesIncentive.id,
        salesIncentive.status,
      );
    }

    await this.dbService.orders.update({
      where: { id: order_id },
      data: { grand_total_comission: salesIncentive.nominal },
    });
  }

  async quotationExportExcelFollowUp(
    res: Response,
    queryParams: QueryParamsDto,
  ) {
    const {
      search,
      status,
      date_from,
      date_to,
      order_by,
      is_free,
      promotion,
    } = queryParams;
    const where: Prisma.quotationWhereInput = {
      AND: [
        status ? { status: { id: { in: status } } } : null,
        ...(search
          ? [
            {
              OR: [
                {
                  order: { vendor: { company_name: { contains: search } } },
                },
                { store: { store_name: { contains: search } } },
                { quotation_number: { contains: search } },
              ],
            },
          ]
          : []),
        ...(is_free
          ? [
            {
              order: {
                m_order_details: {
                  every: {
                    item: {
                      type: 1,
                    },
                  },
                },
              },
            },
          ]
          : []),
        ...(Boolean(promotion)
          ? [
            {
              promotion_id: {
                not: null,
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
          : null,
      ].filter((condition) => Boolean(condition)),
      deleted_at: null,
      order: {
        deleted_at: null,
      },
      quotation_follow_up: {
        every: {
          is_done: false,
        },
      },
    };
    const count = await this.dbService.quotation.count({
      where,
    });

    let dataExcel = [];
    const takeData = 900;
    let skipData = 0;
    const countTake = Math.floor(count / takeData);

    for (let i = 0; i < countTake; i++) {
      skipData = i * takeData;
      const data = await this.dbService.quotation.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          created_at: order_by,
        },
        include: {
          quotation_follow_up: {
            where: {
              deleted_at: null,
            },
          },
          promotion: true,
          quotation_files: true,
          quotation_details: {
            include: {
              category: true,
              work_order_items: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
          order: {
            include: {
              m_order_details: {
                where: {
                  deleted_at: null,
                },
              },
              vendor: true,
              store: true,
              members: true,
              sales: true,
              work_orders: {
                include: {
                  work_order_evidences: true,
                  work_order_status: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      work_order_items: {
                        orderBy: {
                          id: 'desc',
                        },
                      },
                    },
                  },
                  work_order_tukang: {
                    include: {
                      tukang: true,
                    },
                  },
                  status: true,
                },
              },
            },
          },
          status: true,
          store: true,
        },
      });
      dataExcel = [...dataExcel, ...data];
    }

    if (count != dataExcel.length) {
      const data = await this.dbService.quotation.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          created_at: order_by,
        },
        include: {
          quotation_follow_up: {
            where: {
              deleted_at: null,
            },
          },
          promotion: true,
          quotation_files: true,
          quotation_details: {
            include: {
              category: true,
              work_order_items: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
          order: {
            include: {
              m_order_details: {
                where: {
                  deleted_at: null,
                },
              },
              vendor: true,
              store: true,
              members: true,
              sales: true,
              work_orders: {
                include: {
                  work_order_evidences: true,
                  work_order_status: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      work_order_items: {
                        orderBy: {
                          id: 'desc',
                        },
                      },
                    },
                  },
                  work_order_tukang: {
                    include: {
                      tukang: true,
                    },
                  },
                  status: true,
                },
              },
            },
          },
          status: true,
          store: true,
        },
      });
      dataExcel = [...dataExcel, ...data];
    }
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Data Quotation', {
      properties: {
        tabColor: {
          argb: '097969',
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
      { header: 'Quotation ID', key: 'id', width: 15 },
      { header: 'Order ID', key: 'order_id', width: 15 },
      { header: 'Nama Customer', key: 'customer_name', width: 20 },
      { header: 'Tanggal Order', key: 'created_at', width: 20 },
      { header: 'Nama Toko', key: 'store_name', width: 20 },
      { header: 'Nama Vendor', key: 'vendor_name', width: 30 },
      { header: 'Status Quotation', key: 'status_description', width: 20 },
      { header: 'Quotation Grand Total', key: 'grand_total', width: 20 },
      { header: 'FU1', key: 'fu1', width: 25 },
      { header: 'FU2', key: 'fu2', width: 25 },
      { header: 'FU3', key: 'fu3', width: 25 },
      { header: 'Notes', key: 'notes', width: 25 },
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

    dataExcel.forEach((quotation: any) => {
      worksheet.addRow({
        id: quotation.id,
        order_id: quotation.order.id,
        customer_name: quotation.order.members.full_name,
        created_at: new Date(quotation.created_at).toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        store_name: quotation.store.store_name,
        vendor_name: quotation?.order?.vendor
          ? quotation.order.vendor.company_name
          : 'N/a',
        status_description: quotation.status.description,
        grand_total: quotation.grand_total,
        fu1:
          quotation.quotation_follow_up[0]?.follow_up_1 === true
            ? 'YES'
            : 'NO',
        fu2:
          quotation.quotation_follow_up[0]?.follow_up_2 === true
            ? 'YES'
            : 'NO',
        fu3:
          quotation.quotation_follow_up[0]?.follow_up_3 === true
            ? 'YES'
            : 'NO',
        notes: quotation?.quotation_follow_up[0]?.description ?? ''
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
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const now = Date.now();

      const excelFileName = `${baseName}-${now}.xlsx`;
      return path.join(folderPath, excelFileName);
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
        `attachment; filename=${path.basename(excelFilePath)}`,
      );

      const fileStream = fs.createReadStream(excelFilePath);
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
}
