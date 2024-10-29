import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateQuotationPromotionDto } from './dto/create-quotation_promotion.dto';
import { UpdateQuotationPromotionDto } from './dto/update-quotation_promotion.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PAYMENT_TYPE } from 'src/order/enum/payment_type.enum';
import { PdfService } from 'src/common/service/pdf.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class QuotationPromotionService {
  constructor(private readonly dbService: PrismaService, private readonly pdfService: PdfService, private readonly notifService: NotificationsService) { }
  async create(createQuotationPromotionDto: CreateQuotationPromotionDto, quotation_promotion_evidences: Express.Multer.File[], user: users) {
    try {
      const { id: user_id } = user;
      const dto = createQuotationPromotionDto;
      const evidences = quotation_promotion_evidences.length > 0 ? quotation_promotion_evidences.map((x) => ({
        path: x.filename,
        created_by: user_id
      })) : [];

      const data: Prisma.quotation_promotionCreateInput = {
        quotation: {
          connect: {
            id: dto.quotation_id
          }
        },
        promotion_nominal: dto.promotion_nominal,
        description: dto.description,
        status: dto.status,
        quotation_promotion_evidences: {
          createMany: {
            data: evidences
          }
        },
        created_by: user_id
      }

      const [quotation_promotion] = await this.dbService.$transaction([
        this.dbService.quotation_promotion.create({
          data
        })
      ]);

      await this.notifService.create(quotation_promotion, "CREATE",quotation_promotion.created_by, moduleTypeNotification.QUOTATION_PROMOTION, quotation_promotion.id, quotation_promotion.status);

      return quotation_promotion;
    } catch (error) {
      console.log(error);
      throw error
    }
  }


  async findAll(query: QueryParamsDto) {
    try {
      const { page, take, search, date_from, date_to, status } = query;
      const skip = page * take - take;

      const where: Prisma.quotation_promotionWhereInput = {
        AND: [
          ...(search ? [
            {
              OR: [
                {
                  id: !isNaN(+search) ? +search : undefined,
                },
                {
                  quotation_id: !isNaN(+search) ? +search : undefined,
                },
              ]
            }
          ] : []),
          ...(status ? [
            {
              status: {
                in: status
              }
            }
          ] : []),
          ...(date_from ? [
            {
              created_at: {
                gte: date_from
              }
            }
          ] : []),
          ...(date_to ? [
            {
              created_at: {
                lte: date_to
              }
            }
          ] : [])
        ]
      };
      const total = await this.dbService.quotation_promotion.count({
        where
      });

      const data = await this.dbService.quotation_promotion.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          quotation: {
            include: {
              promotion: {
                where: {
                  deleted_at: null
                }
              },
              quotation_receipt: {
                where: {
                  deleted_at: null
                }
              },
              order: {
                include: {
                  m_order_details: {
                    where: {
                      deleted_at: null
                    }
                  }
                }
              }
            }
          }
        }
      });
      const userIds = [
        ...new Set(
          data
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

      const quotationPromotionWithUser = data.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
      }));

      return {
        data: quotationPromotionWithUser,
        meta: {
          skip,
          take,
          page,
          takeTotal: data.length,
          total,
        },
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  } 

  async findOne(id: number) {
    try {
      const data = await this.dbService.quotation_promotion.findFirst({
        where: {
          id
        },
        include: {
          quotation: {
            include: {
              promotion: {
                where: {
                  deleted_at: null
                }
              },
              quotation_receipt: {
                where: {
                  deleted_at: null
                }
              },
              order: {
                include: {
                  m_order_details: {
                    where: {
                      deleted_at: null
                    }
                  }
                }
              }
            }
          },
          quotation_promotion_evidences: {
            where: {
              deleted_at: null
            }
          }
        }
      });
      const userIds = [
        data.created_by,
        data.updated_by,
        data.deleted_by,
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      const quotationPromotionWithUser = {
        ...data,
        created_by: userMap[data.created_by] || null,
        updated_by: userMap[data.updated_by] || null,
        deleted_by: userMap[data.deleted_by] || null,
      };

      return quotationPromotionWithUser;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async update(id: number, updateQuotationPromotionDto: UpdateQuotationPromotionDto, quotation_promotion_evidences: Express.Multer.File[], user: users) {
    try {
      const { id: user_id } = user;
      const dto = updateQuotationPromotionDto;
      const evidences = quotation_promotion_evidences.length > 0 ? quotation_promotion_evidences.map((x) => ({
        path: x.filename,
        created_by: user_id,
      })) : [];

      const data: Prisma.quotation_promotionUpdateArgs = {
        where: {
          id
        },
        data: {
          quotation_id: dto.quotation_id ?? undefined,
          description: dto.description ?? undefined,
          promotion_nominal: dto.promotion_nominal ?? undefined,
          status: dto.status ?? undefined,
          quotation_promotion_evidences: evidences.length > 0 ? {
            createMany: {
              data: evidences
            }
          } : undefined,
          updated_at: new Date(),
          updated_by: user_id
        }
      };

      const [syncFiles, quotationPromotion] = await this.dbService.$transaction([
        this.dbService.quotation_promotion_evidences.deleteMany({
          where: {
            quotation_promotion_id: id
          }
        }),
        this.dbService.quotation_promotion.update(data),
      ]);

      await this.notifService.create(quotationPromotion, "UPDATE",quotationPromotion.updated_by, moduleTypeNotification.QUOTATION_PROMOTION, quotationPromotion.id, quotationPromotion.status);


      return quotationPromotion;
    } catch (error) {
      console.log(error)
      throw error;
    }
  }

  async nextCode() {
    try {
      const quotationPromotion = await this.dbService.quotation_promotion.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return quotationPromotion[0] || null;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const data = await this.dbService.quotation_promotion.update({
        where: {
          id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user.id
        }
      })
      return data
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async promotionRequest(id: number, res: Response) {
    try {
      const data = await this.dbService.quotation_promotion.findFirst({
        where: {
          deleted_at: null,
          deleted_by: null,
          quotation_id: id,
        },
        orderBy: {
          created_at: 'desc'
        },
        include: {
          quotation: {
            include: {
              promotion: true,
              order: {
                include: {
                  vendor: true
                }
              },
              quotation_details: {
                where: {
                  deleted_at: null
                }
              }
            }
          }
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Invoice Rekonsel', {
        properties: {
          tabColor: { argb: '097969' },
        },
        pageSetup: {
          margins: {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.mergeCells('A2:B2');
      worksheet.getCell('A2').value = `DATA PENGAJUAN DISKON`;
      worksheet.getCell('A2').font = { size: 18, bold: false };
      worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

      let rowIndex = 4; 

      const quotationNoPromotion = data.quotation.quotation_details.reduce((acc, curr) => acc + Number(curr.final_price), 0);
      const promotion = data.quotation.promotion ? (-Number(data.quotation.promotion.promotion)) : 0;
      const customerPrice = quotationNoPromotion + promotion;
      const vendorMargin = (quotationNoPromotion * ((Number(data.quotation?.order?.vendor?.margin_nominal ?? 0)) / 100));
      const mitraMargin = 100 - Number(data?.quotation?.order?.vendor?.margin_nominal ?? 0);
      const promotionNominal = Number(data.promotion_nominal) * quotationNoPromotion / 100;
      const customerTransaction = customerPrice - promotionNominal; 

      console.log(promotionNominal);
      


      // Define key-value pairs for each order
      const keyValuePairs = [
        { key: 'Harga NET dari Vendor', value: quotationNoPromotion },
        { key: 'Harga dikurang Promo Survey', value: promotion },
        { key: 'Harga Yang di tawarkan ke customer', value: customerPrice },
        { key: `Margin Mitra10 ${mitraMargin}%`, value: (quotationNoPromotion * (mitraMargin / 100)) },
        { key: `Margin Vendor ${Number(data.quotation?.order?.vendor?.margin_nominal ?? 0)}%`, value: vendorMargin },
        { key: 'Pengajuan Discount Customer', value: promotionNominal },
        { key: 'Total Transakasi Customer', value: customerTransaction },
        { key: 'Margin', value: customerTransaction - vendorMargin },
        { key: 'Margin Mitra setelah Disc', value: Math.ceil((customerTransaction - vendorMargin) / customerTransaction) },
      ];

      keyValuePairs.forEach(({ key, value }, pairIndex) => {
        const row = worksheet.getRow(rowIndex);

        // Style for Key (Column A)
        worksheet.getCell(`A${rowIndex}`).value = `${key}:`;
        worksheet.getCell(`A${rowIndex}`).font = { bold: true };
        worksheet.getCell(`A${rowIndex}`).alignment = { vertical: 'middle', horizontal: 'left' };
        worksheet.getCell(`A${rowIndex}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Style for Value (Column B)
        worksheet.getCell(`B${rowIndex}`).value = value;
        worksheet.getCell(`B${rowIndex}`).alignment = { vertical: 'middle', horizontal: 'left' };
        worksheet.getCell(`B${rowIndex}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        if (rowIndex % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3F3F3' },
          };
        }

        rowIndex++; 
      });

      rowIndex++; 

    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength;
    });

      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/invoice/rekonsel';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${path.basename(excelFilePath)}`);
        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `PengajuanDiskon-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send("An error occurred while generating the invoice.");
    }
  }

  async quotationPdf(quotation_id: number, res: Response) {
    const data = await this.dbService.quotation.findFirst({
      where: {
        id: quotation_id,
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      },
      include: {
        promotion: true,
        quotation_promotion_ho: {
          where: {
            deleted_at: null
          },
          orderBy: {
            created_at: 'desc'
          }
        },
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
                item: true
              }
            },
            members: true,
            store: true,
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

    const buffer = await this.pdfService.generate('quotation-promotion', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=quotation.pdf');
    res.send(buffer);
  }

}
