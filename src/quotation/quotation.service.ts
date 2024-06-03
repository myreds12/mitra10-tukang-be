import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MarginType } from './dto/margin-type.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class QuotationService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
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
      let comission = 0;

      const evidence: Array<Prisma.quotation_filesCreateManyQuotationInput> =
        quotation_files
          ? quotation_files.map((item) => ({
            path: item.filename,
            created_by: user_id,
          }))
          : undefined;

      const statusForEmail = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'QUOTEOUT',
          },
        },
      });

      const promotion = (await this.dbService.promotion.findMany({
        include: {
          promotion_stores: {
            include: {
              store: true
            }
          }
        }
      })).sort();
      const salesInsentive = await this.dbService.sales_incentive.findMany()


      const quotaionDetails: Array<Prisma.quotation_detailsCreateManyQuotationInput> =
        createQuotationDto.quotation_details.map((item) => {
          const prices = Number(item.is_customer ? 0 : item?.price ?? 0);
          const quantity = item.is_customer ? 0 : item.quantity;
          const margin =
            item.margin_type === MarginType.PERCENTAGE
              ? +item.margin >= 1 && +item.margin <= 100
                ? prices * quantity * (+item.margin / 100)
                : 0
              : +item.margin;
          const final_price = prices * quantity + margin;
          console.log(
            prices,
            'Prices',
            quantity,
            'Quantity',
            final_price,
            'Final Price',
            margin,
          );

          grandTotal += final_price ?? 0;
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
            final_price: final_price ?? 0,
          };
        });
      //FIXME: CHECK THIS CODE

      if (salesInsentive.length > 0) {
        const calculateSalesIncentive = (salesIncentives, grandTotal) => {
          const closestIncentive = salesIncentives.reduce((closest, current) =>
            Math.abs(current.min_order - grandTotal) < Math.abs(closest.min_order - grandTotal)
              ? current
              : closest
          );

          if (closestIncentive) {
            if (closestIncentive.insentive_type === 1) {
              comission = (grandTotal * closestIncentive.insentive) / 100;
            } else if (closestIncentive.insentive_type === 2) {
              comission = closestIncentive.insentive;
            }
          }

          return comission;
        };

        const salesIncentive = calculateSalesIncentive(salesInsentive, grandTotal);
      }


      const findClosestPromotion = (promotions, grandTotal, storeId) => {
        const filteredPromotions = promotions.filter(promotion =>
            promotion.promotion_stores.some(promotion_store => promotion_store.store_id === storeId)
        );
    
        return filteredPromotions.length > 0 ?
            filteredPromotions.reduce((closest, current) =>
                Math.abs(current.min_order - grandTotal) < Math.abs(closest.min_order - grandTotal)
                    ? current
                    : closest
            ) :
            null;
    };
      const closestPromotion = findClosestPromotion(promotion, grandTotal, createQuotationDto.store_id);

      console.log(closestPromotion, "CLOSEST PROMOTION");
      

      if (closestPromotion) {
        if (closestPromotion.promotion_stores.some(promotion_store => promotion_store.store_id === createQuotationDto.store_id)) {
          if (closestPromotion.promotion_type === 1) {
            grandTotal -= grandTotal * (closestPromotion.promotion / 100);
          } else if (closestPromotion.promotion_type === 2) {
            grandTotal -= closestPromotion.promotion;
          }
        } else {
          grandTotal -= 0;
        }
      }



      console.log(closestPromotion, "PROMOTION");


      // if (grandTotal >= 500000) comission = (grandTotal * 2.5) / 100;



      console.log(quotaionDetails, 'QUOTATION DETAILS');

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
        ...(closestPromotion ? {
          promotion: {
              connect: {
              id: closestPromotion.id 
            }
          },
        }: undefined),
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
        description: createQuotationDto.description,
        quotation_number: createQuotationDto.quotation_number,
        quotation_date: new Date(createQuotationDto.quotation_date),
        quotation_validity: new Date(createQuotationDto.quotation_validity),
        quotation_disc: createQuotationDto?.quotation_disc,
        quotation_promotion: createQuotationDto?.quotation_promotion,
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
      };

      console.log(comission);

      const [quotation, order] = await this.dbService.$transaction([
        this.dbService.quotation.create(quotation_options),
        this.dbService.orders.update({
          where: {
            id: createQuotationDto.order_id,
          },
          data: {
            grand_total_comission: { increment: comission } ?? undefined,
          },
        }),
      ]);

      await this.orderService.setStatus(
        quotation.order_id,
        quotation.quotation_status,
        user,
      );
      return { quotation, sales_comission: comission ?? 0 };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const { take, page, search, status, date_from, date_to, order_by } =
        queryParamsDto;
      const skip = page * take - take;
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
      const quotation = await this.dbService.quotation.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        orderBy: {
          created_at: order_by,
        },
        include: {
          promotion: true,
          quotation_files: true,
          quotation_details: {
            include: {
              category: true,
              work_order_items: true
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
                      tukang: true
                    }
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
        where
      });

      return {
        data: quotation,
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
              m_order_details: true,
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

      return quotation;
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

      const STATUS_QUOTEOUT = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'QUOTEOUT',
          },
        },
      });

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

      const evidence = [].concat(quotationfiles, receiptfile);

      let grandTotal = 0;
      const quotationDetailsUpsert: Prisma.quotation_detailsUpsertWithWhereUniqueWithoutQuotationInput[] =
        updateQuotationDto.quotation_details.map((item) => {
          let price: number = 0;
          let quantity: number = 0;
          let final_price: number = 0;

          if (!item.is_customer) {
            price = Number(item.price);
            quantity = Number(item.quantity);

            final_price = Number(
              price * quantity +
              (item.margin_type === MarginType.PERCENTAGE
                ? price * quantity * (+item.margin / 100)
                : +item.margin),
            );
          }

          grandTotal += final_price;
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
              final_price,
              work_order_items_id: item?.work_order_item_id,
              is_customer: Boolean(item.is_customer),
              updated_at: new Date(),
              updated_by: user_id,
            },
            create: {
              category_id: item?.category_id,
              item_id: item?.item_id,
              item_type: item?.type,
              description: item?.description,
              name: item?.name,
              unit: item.unit,
              price: item?.price,
              quantity: item?.quantity,
              margin: item?.margin,
              margin_type: item?.margin_type,
              work_order_items_id: item?.work_order_item_id,
              is_customer: Boolean(item.is_customer),
              final_price,
              created_by: user_id,
            },
          };
        });

      const [syncDetails, quotation] = await this.dbService.$transaction([
        this.dbService.quotation_details.updateMany({
          where: {
            quotation_id: id,
            id: {
              notIn: updateQuotationDto.quotation_details
                .filter((x) => Boolean(x?.id))
                .map((item) => {
                  return item.id;
                }),
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.quotation.update({
          where: {
            id,
          },
          data: {
            status: updateQuotationDto?.quotation_status
              ? {
                connect: {
                  id: updateQuotationDto.quotation_status,
                },
              }
              : undefined,
            description: updateQuotationDto?.description ?? undefined,
            readiness: updateQuotationDto?.readiness ?? undefined,
            quotation_number: updateQuotationDto?.quotation_number ?? undefined,

            quotation_date: updateQuotationDto?.quotation_date
              ? new Date(updateQuotationDto?.quotation_date)
              : undefined,
            quotation_validity: updateQuotationDto?.quotation_validity
              ? new Date(updateQuotationDto?.quotation_validity)
              : undefined,
            quotation_disc: updateQuotationDto?.quotation_disc,
            quotation_promotion: updateQuotationDto?.quotation_promotion,
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
            quotation_files: quotation_files
              ? {
                createMany: {
                  data: evidence,
                },
              }
              : undefined,
            quotation_details: {
              upsert: quotationDetailsUpsert,
            },
          },
        }),
      ]);

      this.orderService.setStatus(
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
      const quotation = await this.dbService.quotation.update({
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
        category: {
          in: ['quotein', 'quoteout'],
        },
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
    if (quotationFind.status.category.toLowerCase().includes('quoteout'))
      throw new BadRequestException('Cannot change status!');

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

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncQuotationMail() {
    try {
      this.logger.verbose('Initiate syncQuotationMail');

      // TODO: SEARCH QUOTATION WHERE READINESS 2 AND QUOTATION STATUS QUOTEOUT
      const quotations = await this.dbService.quotation.findMany({
        where: {
          status: {
            category: {
              contains: 'QUOTEOUT',
            },
          },
          readiness: 2,
        },
        take: 10,
      });

      if (!quotations.length) {
        this.logger.log('No pending quotation to send');
        return 0;
      }

      this.logger.log(`${quotations.length} pending quotations found`);
      await Promise.all(
        quotations.map(async (quotation) => {
          const { id } = quotation;
          this.logger.log(`${quotations.length} pending quotations found`);

          // TODO: TRIGGER SEND EMAIL
          await this.emailQueue.add('send-quotation-mail', { id });

          // TODO: CHANGE CURRENT QUOTATION STATUS TO READINESS 4
          await this.dbService.quotation.update({
            where: {
              id,
            },
            data: {
              readiness: 4,
            },
          });
        }),
      );

      this.logger.log('Finished syncQuotationMail');

      return quotations.length;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkvalidity() {
    try {
      this.logger.log('init checkvalidity');
      const quotations = await this.dbService.quotation.findMany({
        where: {
          status: {
            category: {
              contains: 'QUOTEOUT',
            },
          },
          quotation_validity: {
            lte: new Date(),
          },
        },
      });

      if (!quotations.length) {
        this.logger.log('No quotation found');
        return 0;
      }

      this.logger.log(`${quotations.length} quotation found`);

      const NEWSTATUS = await this.dbService.status.findFirst({
        where: {
          category: {
            in: ['CLOSED', 'UNPAID'],
          },
        },
      });

      await Promise.all(
        quotations.map(async (quotation) => {
          const { id } = quotation;
          await this.dbService.quotation.update({
            where: {
              id,
            },
            data: {
              quotation_status: NEWSTATUS.id,
            },
          });
        }),
      );

      return 1;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }


  async quotationExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

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
        { header: 'Quotation Id', key: 'id', width: 10 },
        { header: 'Order Id', key: 'order_id', width: 25 },
        { header: 'Jenis Jasa', key: 'item_name', width: 50 },
        { header: 'Quantity Jasa', key: 'item_quantity', width: 50 },
        { header: 'Unit Jasa', key: 'item_unit', width: 50 },
        { header: 'Material yang Dibutuhkan', key: 'work_order_items', width: 50 },
        { header: 'Quantity Material', key: 'work_order_items_quantity', width: 50 },
        { header: 'Unit Material', key: 'work_order_items_unit', width: 50 },
        { header: 'Tanggal Quotation', key: 'quotation_date', width: 50 },
        { header: 'Batas Tanggal Quotation', key: 'quotation_validity', width: 50 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Nama Vendor', key: 'company_name', width: 30 },
        { header: 'Nama Sales', key: 'sales_name', width: 35 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
        { header: 'Quotation Dibuat ', key: 'created_at', width: 30 },
        { header: 'Grand Total', key: 'grand_total', width: 25 },
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

      data.forEach((quotation) => {
        const itemName = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.name || 'N/a').join(', ') : 'N/a';
        const itemQuantity = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.quantity || 'N/a').join(', ') : 'N/a';
        const itemUnit = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.unit || 'N/a').join(', ') : 'N/a';
        const tukangName = quotation.order.work_orders ? quotation.order.work_orders.work_order_tukang.map((item) => item?.tukang?.full_name).join(', ') : 'N/a';
        const workOrderItems = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.work_order_items?.name || 'N/a').join(', ') : 'N/a'
        const workOrderItemsQuantity = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.work_order_items?.quantity || 'N/a').join(', ') : 'N/a'
        const workOrderItemsUnit = quotation.quotation_details ? quotation.quotation_details.map((item) => item?.work_order_items?.unit || 'N/a').join(', ') : 'N/a'
        const formattedDateTime = (dateTime) => `${new Date(dateTime).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${dateTime.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
        const grandTotal = Number(quotation.quotation_grand_total);
        const formattedGrandTotal = !isNaN(grandTotal)
          ? new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
          }).format(grandTotal)
          : 'Rp. 0';
        const row = worksheet.addRow({
          id: quotation.id,
          order_id: quotation.order ? quotation.order.id : 'N/a',
          item_name: itemName,
          item_quantity: itemQuantity,
          item_unit: itemUnit,
          work_order_items: workOrderItems,
          work_order_items_quantity: workOrderItemsQuantity,
          work_order_items_unit: workOrderItemsUnit,
          quotation_date: quotation.quotation_date ? formattedDateTime(quotation.quotation_date) : 'N/a',
          quotation_validity: quotation.quotation_validity ? formattedDateTime(quotation.quotation_validity) : 'N/a',
          store_name: quotation.order.store ? quotation.order.store.store_name : 'N/a',
          company_name: quotation.order ? quotation.order.vendor.company_name : 'N/a',
          sales_name: quotation.order.sales ? quotation.order.sales.full_name : 'N/a',
          tukang_name: tukangName,
          created_at: formattedDateTime(quotation.created_at),
          grand_total: formattedGrandTotal,
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

      const totalGrandTotal = data.reduce(
        (total, order) => total + Number(order.quotation_grand_total),
        0,
      );
      const formattedTotalGrandTotal = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
      }).format(totalGrandTotal);
      const totalRow = worksheet.addRow({
        id: 'Total',
        order_id: '',
        item_name: '',
        item_quantity: '',
        item_unit: '',
        work_order_items: '',
        work_order_items_quantity: '',
        work_order_items_unit: '',
        quotation_date: '',
        quotation_validity: '',
        store_name: '',
        company_name: '',
        sales_name: '',
        tukang_name: '',
        created_at: '',
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

      worksheet.mergeCells(`A${totalRow.number}:N${totalRow.number}`);

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
}

