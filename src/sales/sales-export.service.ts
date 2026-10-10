/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, users } from '@prisma/client';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';

@Injectable()
export class SalesExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  async findOne(id: number) {
    return await this.dbService.sales.findFirst({
      where: { id },
      include: {
        store: true,
      },
    });
  }

  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    try {
      const { status, store_id, date_from, date_to } = query;
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Template Sales Commission', {
        properties: {
          tabColor: { argb: 'FF4CAF50' },
          outlineLevelCol: 6,
          outlineLevelRow: 40,
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

      // Mendefinisikan kolom-kolom header
      worksheet.columns = [
        { header: 'Order Id', key: 'order_id', width: 20 },
        { header: 'Tanggal Order', key: 'order_create', width: 40 },
        { header: 'Nama Customer', key: 'member_name', width: 40 },
        {
          header: 'Quotation Grand Total',
          key: 'quotation_grand_total',
          width: 35,
        },
        { header: 'Status Order', key: 'order_status', width: 40 },
        { header: 'Sales Id', key: 'sales_id', width: 20 },
        { header: 'Nama Sales', key: 'sales_name', width: 20 },
        { header: 'Bank', key: 'bank_name', width: 30 },
        { header: 'Nama Akun Bank', key: 'account_name', width: 30 },
        { header: 'Nomor Akun Bank', key: 'account_number', width: 30 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Incentive Id', key: 'incentive_id', width: 20 },
        { header: 'Incentive Nominal', key: 'incentive_nominal', width: 35 },
        {
          header: 'Insentif Yang Harus Dibayarkan',
          key: 'received_incentive',
          width: 45,
        },
        { header: 'Status Incentive', key: 'status', width: 25 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      const where: Prisma.sales_incentiveWhereInput = {
        AND: [
          ...(status
            ? [
                {
                  status: {
                    in: status,
                  },
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  sales: {
                    store_id: {
                      in: store_id,
                    },
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      // Mengambil data dari database
      const salesIncentives = await this.dbService.sales_incentive.findMany({
        where,
        include: {
          sales: {
            select: {
              id: true,
              full_name: true,
              account_name: true,
              account_number: true,
              store: {
                select: {
                  store_name: true,
                },
              },
              bank: {
                select: {
                  bank_name: true,
                },
              },
            },
          },
          quotation: {
            select: {
              order_id: true,
              quotation_grand_total: true,
              order: {
                select: {
                  created_at: true,
                  members: {
                    select: {
                      full_name: true,
                    },
                  },
                  status: {
                    select: {
                      category: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
          incentive: true,
        },
      });

      salesIncentives.forEach((incentive) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        worksheet.addRow({
          order_id: incentive?.quotation?.order_id ?? '',
          order_create: formattedDateTime(incentive.quotation.order.created_at),
          member_name: incentive?.quotation?.order?.members?.full_name ?? '',
          quotation_grand_total: Number(
            incentive.quotation.quotation_grand_total,
          ),
          order_status: incentive?.quotation?.order?.status?.description ?? '',
          sales_id: incentive.sales_id ?? '',
          sales_name: incentive?.sales?.full_name ?? '',
          bank_name: incentive?.sales?.bank?.bank_name ?? '',
          account_name: incentive.sales?.account_name ?? '',
          account_number: incentive?.sales?.account_number ?? '',
          store_name: incentive?.sales?.store?.store_name ?? '',
          incentive_id: incentive?.incentive_id ?? '',
          incentive_nominal:
            incentive.incentive.type === IncentiveType.NOMINAL
              ? Number(incentive.incentive.incentive)
              : `${incentive.incentive.incentive}%`,
          received_incentive: Number(incentive.nominal),
          status: IncentiveStatus[incentive.status],
          notes: incentive?.notes ?? '',
        });
      });

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/sales';
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

      const generateExcelFile = async (res: Response) => {
        const baseName = 'SalesComission';
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      await generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async syncSalesCommission(filePath: string, user: users) {
    try {
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      const salesOrderPairs = [];
      let updatedCount = 0;

      //TODO: SYNC IF NOTES IS IMAGE
      for (
        let rowNumber = 2;
        rowNumber <= worksheet.actualRowCount;
        rowNumber++
      ) {
        const sales_id = worksheet.getCell(`F${rowNumber}`).value as number;
        const order_id = worksheet.getCell(`A${rowNumber}`).value as number;
        const incentive_id = worksheet.getCell(`L${rowNumber}`).value as number;
        const notes = worksheet.getCell(`P${rowNumber}`).value;

        if (sales_id && order_id && incentive_id) {
          salesOrderPairs.push({
            sales_id,
            order_id,
            incentive_id,
            notes,
          });
        }
      }

      await Promise.all(
        salesOrderPairs.map(async (pair) => {
          const order = await this.dbService.orders.findFirst({
            where: {
              id: pair.order_id,
            },
            include: {
              quotation: true,
            },
          });

          if (!order) {
            console.warn(`Quotation with ID ${pair.order_id} not found.`);
            return;
          }

          const sales = await this.findOne(pair.sales_id);
          if (!sales) {
            console.warn(`Sales with ID ${pair.sales_id} not found.`);
            return;
          }

          const setting_incentive =
            await this.dbService.setting_incentive.findFirst({
              where: {
                id: pair.incentive_id,
              },
            });

          if (!setting_incentive) {
            console.warn(`Incentive with ID ${pair.incentive_id} not found.`);
            return;
          }

          const incentive = await this.dbService.sales_incentive.findFirst({
            where: {
              sales_id: sales.id,
              incentive_id: setting_incentive.id,
              status: IncentiveStatus.PENGAJUAN_INSENTIF,
            },
          });

          if (!incentive) {
            console.warn(`Sales Incentive  not found!`);
            return;
          }

          const updateSales = await this.dbService.sales_incentive.update({
            where: {
              id: incentive.id,
            },
            data: {
              status: IncentiveStatus.INSENTIF_DIBAYARKAN,
              notes: pair.notes ?? '',
              updated_at: new Date(),
              updated_by: user.id,
            },
          });
          await this.notifService.create(
            {
              sales_incentive: updateSales,
              orders: order,
            },
            'UPDATE',
            updateSales.updated_by,
            moduleTypeNotification.INCENTIVE,
            updateSales.id,
            updateSales.status,
          );
          updatedCount += 1;
        }),
      );

      return { count: updatedCount };
    } catch (error) {
      console.error('Error synchronizing commission status:', error);
      throw error;
    }
  }



  async salesExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { search, date_from, date_to, order_by, top_best, store_id } =
        queryParams;
      // const skip = page * take - take;
      const where: Prisma.salesWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    { full_name: { contains: search } },
                    { sales_brand: { contains: search } },
                    {
                      sales_categories: {
                        some: {
                          categories: { category_name: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  store_id: {
                    in: store_id,
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.sales.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;

        const data = await this.dbService.sales.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            ...(Boolean(top_best)
              ? {
                  order_total: 'desc',
                }
              : {
                  created_at: order_by,
                }),
          },
          include: {
            orders: {
              take: 5,
              orderBy: {
                created_at: 'desc',
              },
            },
            bank: true,
            store: true,
            sales_brands: {
              include: {
                brands: true,
              },
            },
            sales_categories: {
              include: {
                categories: true,
              },
            },
            users: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.sales.findMany({
          where,
          skip: skipData,
          take: count - dataExcel.length,
          orderBy: {
            ...(Boolean(top_best)
              ? {
                  order_total: 'desc',
                }
              : {
                  created_at: order_by,
                }),
          },
          include: {
            bank: true,
            store: true,
            sales_brands: {
              include: {
                brands: true,
              },
            },
            sales_categories: {
              include: {
                categories: true,
              },
            },
            users: true,
            orders: {
              take: 5,
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Profile Sales ', {
        properties: {
          tabColor: {
            argb: 'FF4CAF50',
          },
          outlineLevelCol: 6,
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
        { header: 'Sales Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Sales', key: 'full_name', width: 35 },
        { header: 'NIK', key: 'nik', width: 35 },
        { header: 'Nama Bank', key: 'bank_name', width: 35 },
        { header: 'Nama Akun Bank', key: 'account_name', width: 35 },
        { header: 'Nomor Akun Bank', key: 'number_account', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Nama Brand', key: 'sales_brand', width: 35 },
        { header: 'Order Total', key: 'order_total', width: 25 },
        { header: 'Sales Category', key: 'sales_categories', width: 50 },
        { header: 'Username Sales', key: 'username', width: 40 },
        { header: 'Sales Dibuat', key: 'created_at', width: 35 },
        { header: 'Tanggal Terakhir Order', key: 'order_date', width: 55 },
        { header: 'Selisih', key: 'date_diff', width: 35 },
        { header: 'Status', key: 'is_active', width: 35 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      dataExcel.forEach((sales) => {
        const salesCategories =
          sales?.sales_categories?.length > 0
            ? sales.sales_categories
                .map((category) => category.categories.category_name)
                .join(',')
            : '';

        const formattedDateTime = (dateTime) =>
          `${dateTime.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta',
            hour12: false,
          })}`;

        const currentMonth = new Date();
        const orderDate =
          sales?.orders?.length > 0
            ? new Date(sales.orders[0].created_at)
            : sales.created_at;

        const monthDifference =
          (currentMonth.getFullYear() - orderDate.getFullYear()) * 12 +
          currentMonth.getMonth() -
          orderDate.getMonth();

        const row = worksheet.addRow({
          id: sales.id,
          store_name: sales?.store ? sales.store.store_name : '',
          full_name: sales?.full_name ? sales.full_name : '',
          nik: sales?.nik ? sales.nik : '',
          bank_name: sales?.bank ? sales.bank.bank_name : '',
          account_name: sales?.account_name ? sales.account_name : '',
          number_account: sales?.account_number ? sales.account_number : '',
          phone_number: sales?.phone_number ? sales.phone_number : '',
          sales_brand: sales?.sales_brand ? sales.sales_brand : '',
          order_total: sales?.order_total ? sales.order_total : '',
          sales_categories: salesCategories,
          username: sales?.users ? sales.users.username : '',
          created_at: formattedDateTime(sales?.created_at),
          order_date:
            sales?.order?.length > 0
              ? formattedDateTime(sales?.order[0]?.created_at)
              : 'Tidak Ada Order',
          date_diff: `${monthDifference} Bulan`,
          is_active: sales?.is_active ? 'Aktif' : 'Tidak Aktif',
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

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/sales';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook,
        excelFilePath,
        res,
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

      const generateExcelFile = async (data, res) => {
        const baseName = `DataSales`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(dataExcel, res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


}
