/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class QuotationExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

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
