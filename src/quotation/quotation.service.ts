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
import { Response } from 'express';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { WorkOrderMaterialType } from 'src/work_orders/dto/work-order-material-type.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { QuotationQueryService } from './quotation-query.service';
import { QuotationLifecycleService } from './quotation-lifecycle.service';
import { QuotationExportService } from './quotation-export.service';

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
    private violationDetector: ViolationDetectorService,
    private readonly whatsAppService: WhatsAppService,
    private readonly queryService: QuotationQueryService,
    private readonly lifecycleService: QuotationLifecycleService,
    private readonly exportService: QuotationExportService,
  ) {}

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
          if (typeof item.price === 'string' && item.price.includes(',')) {
            throw new BadRequestException('Harga tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
          }
          if (typeof item.margin === 'string' && item.margin.includes(',')) {
            throw new BadRequestException('Margin tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
          }

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

        // =========================================
        // VENDOR VIOLATION TRIGGER
        // Check jika quotation dibuat setelah > 2-3 hari sejak Survey Selesai
        // =========================================
        await this.checkQuotationLateness(quotation, order);
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

  /**
   * Trigger #10, #11: Check quotation lateness sejak Survey Selesai
   */
  private async checkQuotationLateness(
    quotation: any,
    order: any,
  ): Promise<void> {
    try {
      if (!order?.vendor_id) return;

      // Cari history Survey Selesai
      const surveyDoneHistory = await this.dbService.order_histories.findFirst({
        where: {
          order_id: order.id,
          status: { category: 'SURVEYDONE' },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!surveyDoneHistory) {
        this.logger.debug(`No SURVEYDONE history found for order ${order.id}`);
        return;
      }

      const surveyDoneDate = new Date(surveyDoneHistory.created_at);
      const now = new Date();
      const daysDiff = Math.floor(
        (now.getTime() - surveyDoneDate.getTime()) / (24 * 60 * 60 * 1000),
      );

      this.logger.debug(
        `Quotation #${quotation.id} created ${daysDiff} days after SURVEYDONE for order ${order.id}`,
      );

      // Jika quotation dibuat > H+2 atau H+3 sejak Survey Selesai, catat pelanggaran
      if (daysDiff >= 3) {
        await this.violationDetector.recordViolation(
          'QUOTATION_LATE_H3',
          {
            vendorId: order.vendor_id,
            orderId: order.id,
            quotationId: quotation.id,
            description: `Quotation terbit ${daysDiff} hari setelah Survey Selesai (limit: H+3)`,
            // [POIN 6] SYSTEM_GENERATED — deteksi otomatis via scheduler
            evidence: {
              provenance: 'SYSTEM_GENERATED',
              snapshot: {
                quotationId: quotation.id,
                orderId: order.id,
                daysSinceSurveyDone: daysDiff,
                threshold: 'H+3',
                triggeredAt: new Date().toISOString(),
              },
            },
          },
        );
      } else if (daysDiff >= 2) {
        await this.violationDetector.recordViolation(
          'QUOTATION_LATE_H2',
          {
            vendorId: order.vendor_id,
            orderId: order.id,
            quotationId: quotation.id,
            description: `Quotation terbit ${daysDiff} hari setelah Survey Selesai (limit: H+2)`,
            // [POIN 6] SYSTEM_GENERATED snapshot
            evidence: {
              provenance: 'SYSTEM_GENERATED',
              snapshot: {
                quotationId: quotation.id,
                orderId: order.id,
                daysSinceSurveyDone: daysDiff,
                threshold: 'H+2',
                triggeredAt: new Date().toISOString(),
              },
            },
          },
        );
      }
    } catch (error) {
      this.logger.error('Error checking quotation lateness', error);
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
        include: { promotion: true, quotation_follow_up: true, status: true },
      });

      // console.log('PAYLOAD', updateQuotationDto);

      const promotion =
        (updateQuotationDto?.promotion_id ?? quotationForUpdate?.promotion?.id) > 0
          ? await this.dbService.promotion.findFirstOrThrow({
            where: {
              id: updateQuotationDto?.promotion_id ?? quotationForUpdate?.promotion?.id,
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
        (item) => {

          if (typeof item.price === 'string' && item.price.includes(',')) {
            throw new BadRequestException('Harga tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
          }
          if (typeof item.margin === 'string' && item.margin.includes(',')) {
            throw new BadRequestException('Margin tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
          }

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
          // console.log(`PRICE${[i]}`, price);

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

      let shouldSendQuotationWhatsApp = false;

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

        shouldSendQuotationWhatsApp =
          quotation.status?.category === 'QUOTEOUT' &&
          quotationForUpdate.status?.category !== 'QUOTEOUT';
      }

      const existingIncentive = await this.dbService.sales_incentive.findFirst({
        where: { quotation_id: id },
      });

      if (
        (!existingIncentive && quotation.status.category === 'QUOTATIONPAID') ||
        quotation.status.category === 'QUOTATIONPAIDSTEPTHREE' || quotation.status.category === 'QUOTATIONPAIDSTEPTWO' || quotation.status.category === 'QUOTATIONPAIDSTEPONE'
      ) {
        // console.log('INCENTIVE[START]');
        await this.lifecycleService.generateSalesIncentive(
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

      if (shouldSendQuotationWhatsApp) {
        try {
          await this.whatsAppService.sendQuotationNotification(quotation.id);
        } catch (err) {
          console.error('WA quotation notification failed:', err);
        }
      }

      return quotation;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  // Delegations to QuotationQueryService
  async findAll(queryParamsDto: QueryParamsDto) {
    return this.queryService.findAll(queryParamsDto);
  }

  async findOne(id: number) {
    return this.queryService.findOne(id);
  }

  async getCode() {
    return this.queryService.getCode();
  }

  async quotationFollowUp(
    quotationFollowUpDto: CreateQuotationDto,
    user: users,
  ) {
    return this.queryService.quotationFollowUp(quotationFollowUpDto, user);
  }

  // Delegations to QuotationLifecycleService
  async setStatus(id: number, status_id: number, user: users) {
    return this.lifecycleService.setStatus(id, status_id, user);
  }

  async incentiveDuplicate(id: number) {
    return this.lifecycleService.incentiveDuplicate(id);
  }

  async updatePromotionQuotation() {
    return this.lifecycleService.updatePromotionQuotation();
  }

  async checkvalidity() {
    return this.lifecycleService.checkvalidity();
  }

  async remove(id: number, user_id: number) {
    return this.lifecycleService.remove(id, user_id);
  }

  // Delegations to QuotationExportService
  async quotationExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.exportService.quotationExportExcel(res, queryParams);
  }

  async quotationExportExcelFollowUp(res: Response, queryParams: QueryParamsDto) {
    return this.exportService.quotationExportExcelFollowUp(res, queryParams);
  }
}
