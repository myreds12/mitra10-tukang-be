import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';

@Injectable()
export class ReportsGeneralService {
  private readonly logger = new Logger(ReportsGeneralService.name);

  constructor(private readonly dbService: PrismaService) {}

async generalReport(queryParams: QueryParamsDto, res: Response) {
    try {
      const {
        search,
        status,
        date_from,
        date_to,
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
      } = queryParams;

      if (!date_from && date_to) {
        throw new BadRequestException(
          'Mohon untuk menginput date from dan date to!',
        );
      }

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
          ...(history_status
            ? [
                {
                  order_history: {
                    some: {
                      status_id: {
                        in: history_status,
                      },
                    },
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
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Installation Booking');

      const data = await this.dbService.orders.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          refund: {
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
              invoice_number: true,
              total: true,
              type: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
            },
          },
          complaints: {
            include: {
              complaint_histories: {
                include: {
                  complaint_evidence: true,
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
                  type: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                  // prices: {
                  //   where: {
                  //     deleted_at: null,
                  //     periodic_start: { lte: new Date() },
                  //     periodic_end: { gte: new Date() },
                  //   }
                  // }
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
            orderBy: {
              created_at: 'desc',
            },
            include: {
              promotion: true,
              quotation_receipt: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
        },
      });

      if (data.length === 0)
        throw new NotFoundException('Order data not found');

      const itemMap = new Map();

      data.forEach((order) => {
        order.m_order_details.forEach((detail) => {
          if (detail?.item?.type === 1 || detail?.item?.type === 2) {
            const fullName = detail.item.item_name;
            const quantity = detail?.quantity || 0;
            const type = detail.item.type;

            let baseName;
            if (type === 1) {
              baseName = fullName;
            } else if (type === 2) {
              const words = fullName.split(' ');
              baseName =
                words.length >= 2 ? `${words[0]} ${words[1]}` : fullName;
            }

            if (baseName) {
              const key = `${baseName}_${type}`;

              if (itemMap.has(key)) {
                const itemData = itemMap.get(key);
                itemData.quantity += quantity;
                itemData.orderCount += 1;
                itemMap.set(key, itemData);
              } else {
                itemMap.set(key, {
                  itemName: baseName,
                  quantity: quantity,
                  orderCount: 1,
                  type: type,
                });
              }
            }
          }
        });
      });

      interface Item {
        itemName: string;
        quantity: number;
        orderCount: number;
        type: number;
      }

      const allItems = [...itemMap.values()].map((itemData) => ({
        itemName: itemData.itemName,
        quantity: itemData.quantity,
        orderCount: itemData.orderCount,
        type: itemData.type,
      }));

      const bookReceived = data.filter(
        (x) => x.status.category != 'PICKLIST',
      ).length;
      console.log('BOOK RECEIVED', bookReceived);

      const validCategories = [
        'WORKEND',
        'SURVEYDONE',
        'RESURVEYDONE',
        'WORKENDSTEPONE',
        'WORKENDSTEPTWO',
        'QUOTEIN',
        'QUOTEOUT',
        'REWORKEND',
        'INVESTIGATED',
        'INVESTIGATE',
        'QUOTATIONPAID',
        'QUOTATIONDRAFT',
        'QUOTATIONPAIDSTEPONE',
        'QUOTATIONPAIDSTEPTWO',
        'QUOTATIONPAIDSTEPTHREE',
        'APPROVED',
        'REJECTED',
        'PAID',
        'DONE',
      ];

      const orderDone1 = data.filter(({ status }) =>
        validCategories.includes(status.category),
      ).length;
      console.log('ORDER DONE 1', orderDone1);

      const orderDone2 = data.filter(
        ({ status, payment_type }) =>
          [
            'WORKREQ',
            'WORKSTART',
            'TUKANGWORK',
            'REWORKSTART',
            'RETUKANGWORK',
          ].includes(status.category) && payment_type === 'survey',
      ).length;
      console.log('ORDER DONE 2', orderDone2);

      const currentDate = new Date(date_from);

      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        2,
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1,
      );

      const nextMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        2,
      );
      const endOfNextMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 2,
        2,
      );

      startOfMonth.setHours(0, 0, 0, 0);
      endOfMonth.setHours(0, 0, 0, 0);
      nextMonth.setHours(0, 0, 0, 0);
      endOfNextMonth.setHours(0, 0, 0, 0);
      console.log('NEXT MONTH', nextMonth);
      console.log('END OF NEXT MONTH', endOfNextMonth);
      const statusPending = [
        'SURVEYSTART',
        'TUKANGSURVEY',
        'SURVEYREQ',
        'RESCHEDULE',
        'RETUKANGSURVEY',
        'INVESTIGATE',
        'RESURVEYREQ',
        'RESURVEYSTART',
        'RESURVEYDONE',
        'REWORKREQ',
        'REWORKSTART',
        'BOOK',
        'BOOKED',
        'RESURVEYDONE',
        'COMPLAINTREJECTEDBYHO',
        'COMPLAINTREJECTEDBYVENDOR',
        'RESCHEDULEAPPROVEDBYHO',
        'RESCHEDULEAPPROVEDBYVENDOR',
        'RESCHEDULEREJECTEDBYVENDOR',
        'REFUNDAPPROVEDBYHO',
        'REFUNDREJECTEDBYHO',
      ];

      const isWithinDateRange = (date) =>
        date && new Date(date) >= startOfMonth && new Date(date) <= endOfMonth;

      const orderPending1 = data.filter(({ status, request_survey }) => {
        const isInDateRange = isWithinDateRange(request_survey);
        return statusPending.includes(status.category) && isInDateRange;
      }).length;

      const orderPending2 = data.filter(
        ({ status, payment_type, request_survey }) =>
          [
            'WORKREQ',
            'TUKANGWORK',
            'WORKSTART',
            'COMPLAINTREJECTEDBYHO',
            'COMPLAINTREJECTEDBYVENDOR',
            'RESCHEDULEAPPROVEDBYHO',
            'RESCHEDULEAPPROVEDBYVENDOR',
            'RESCHEDULEREJECTEDBYVENDOR',
            'REFUNDAPPROVEDBYHO',
            'REFUNDREJECTEDBYHO',
            'WORKREQSTEPTWO',
            'WORKREQSTEPONE',
            'WORKSTARTSTEPONE',
            'WORKENDSTEPONE',
            'WORKENDSTEPTHREE',
            'WORKSTARTSTEPTWO',
            'WORKSTARTSTEPTHREE',
            'WORKENDSTEPTWO',
            'RETUKANGWORK',
            'REWORK',
            'RETUKANGWORKSTEPTWO',
            'RETUKANGWORKSTEPONE',
            'TUKANGWORKSTEPONE',
            'TUKANGWORKSTEPTWO',
            'TUKANGWORKSTEPTHREE',
          ].includes(status.category) &&
          ['gratis', 'pemasangan_tanpa_survey'].includes(payment_type) &&
          isWithinDateRange(request_survey),
      ).length;
      const orderRefund = data.filter(
        (x) =>
          x.refund.length > 0 ||
          x.status.category === 'CANCELREFUND' ||
          x.status.category === 'REFUND' ||
          x.refund.length > 0,
      ).length;

      const orderCancel = data.filter(
        (x) => x.status.category === 'CANCEL',
      ).length;

      const totalProgressOrder = [
        'COMPLAINT',
        'REFUND',
        'RESCHEDULE',
        'WORKEND',
        'WORKENDSTEPONE',
        'WORKENDSTEPTWO',
        'WORKENDSTEPTHREE',
        'QUOTEIN',
        'QUOTEOUT',
        'QUOTATIONPAID',
        'QUOTATIONDRAFT',
        'DONE',
        'SURVEYDONE',
      ];

      const isWithinNextMonth = (date) =>
        date && new Date(date) >= nextMonth && new Date(date) < endOfNextMonth;

      const orderProgress = data.filter(
        ({ status, request_survey }) =>
          !totalProgressOrder.includes(status.category) &&
          isWithinNextMonth(request_survey),
      ).length;

      const orderSurvey = data.filter(
        (x) => x.payment_type === 'survey',
      ).length;
      // console.log('ORDER SURVEY', orderSurvey);

      const quotationPaid = data.filter(
        (x) =>
          x?.quotation[0]?.receipt_quotation != null ||
          (x?.quotation[0]?.quotation_receipt.length > 0 &&
            x.payment_type === 'survey'),
      ).length;
      const quotationPaidValue = data
        .filter(
          (x) =>
            x?.quotation[0]?.receipt_quotation != null ||
            (x?.quotation[0]?.quotation_receipt.length > 0 &&
              x.payment_type === 'survey'),
        )
        .reduce((total, order) => {
          const grandTotal = Number(
            order.quotation[0]?.quotation_grand_total || 0,
          );
          return total + grandTotal;
        }, 0);

      const quotationUnpaid = data.filter(
        (x) =>
          (x?.quotation[0]?.receipt_quotation === null ||
            (x.quotation[0]?.quotation_special === 1 &&
              x?.quotation[0]?.quotation_receipt &&
              x.quotation[0].quotation_receipt.length === 0)) &&
          x.payment_type === 'survey',
      ).length;
      const quotationUnpaidValue = data
        .filter(
          (x) =>
            x?.quotation[0]?.receipt_quotation === null ||
            (x.quotation[0]?.quotation_special === 1 &&
              x?.quotation[0]?.quotation_receipt &&
              x.quotation[0].quotation_receipt.length === 0 &&
              x.payment_type === 'survey'),
        )
        .reduce((total, order) => {
          const grandTotal = Number(
            order.quotation[0]?.quotation_grand_total || 0,
          );
          return total + grandTotal;
        }, 0);

      const ongoingSurveyCategories = [
        'SURVEYREQ',
        'SURVEYSTART',
        'TUKANGSURVEY',
        'INVESTIGATED',
        'RESURVEY',
        'BOOKED',
        'BOOK',
        'REWORK',
        'INVESTIGATE',
        'RESURVEYREQ',
        'RESURVEYSTART',
        'RESURVEYDONE',
        'REWORKREQ',
        'REWORKSTART',
        'RESURVEYDONE',
      ];

      const orderSurveyOnGoing = data.filter(
        (x) =>
          ongoingSurveyCategories.includes(x.status.category) &&
          x.payment_type === 'survey',
      ).length;
      const orderSurveyNoQuotation = data.filter(
        (x) =>
          x.payment_type === 'survey' &&
          x.quotation.length === 0 &&
          x.status.category === 'SURVEYDONE',
      ).length;
      const orderSurveyCancelRefund = data.filter(
        (x) =>
          (x.payment_type === 'survey' &&
            x.quotation.length === 0 &&
            x.status.category === 'CANCELREFUND') ||
          x.status.category === 'REFUND',
      ).length;

      const dateFrom = new Date(date_from);
      const dateTo = new Date(date_to);

      const formattedDateFrom = dateFrom.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const formattedDateTo = dateTo.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const titleCell = worksheet.getCell('A1');
      worksheet.getRow(1).height = 40;
      titleCell.value = `Installation Service: ${formattedDateFrom} - ${formattedDateTo}`;

      titleCell.font = { size: 16, bold: true, color: { argb: 'FF0000FF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF' },
      };
      worksheet.mergeCells('A1:F1');

      worksheet.addRow([
        'Installation Booking',
        '',
        'Survey',
        '',
        `Job Done: ${orderDone1 + orderDone2}`,
      ]);

      const headerRow = worksheet.getRow(2);
      headerRow.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { horizontal: 'center' };

      headerRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };
      headerRow.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };
      headerRow.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };
      worksheet.mergeCells('E2:F2');

      const example = [];

      example.push([
        `Booking Received: ${bookReceived}`,
        '',
        `Survey: ${orderSurvey}`,
        '',
        `Add Program`,
      ]);

      const currentMonth = dateFrom.toLocaleString('default', {
        month: 'long',
      });

      const nextMonthDate = new Date(
        dateFrom.getFullYear(),
        dateFrom.getMonth() + 1,
      );
      const nextMonthName = nextMonthDate.toLocaleString('default', {
        month: 'long',
      });

      interface Status {
        label: string;
        value: string | number;
        quotationLabel: string;
        quotationValue: string | number;
      }

      // Data untuk entri default di statuses
      const statuses: Status[] = [
        {
          label: 'Done',
          value: orderDone1 + orderDone2,
          quotationLabel: 'Survey & Implementation',
          quotationValue: quotationPaid,
        },
        {
          label: `Pending (Req Date ${currentMonth})`,
          value: orderPending1 + orderPending2,
          quotationLabel: 'Total Value',
          quotationValue: quotationPaidValue,
        },
        {
          label: 'Refund',
          value: orderRefund,
          quotationLabel: 'Survey & Quotation',
          quotationValue: quotationUnpaid,
        },
        {
          label: 'Cancel',
          value: orderCancel,
          quotationLabel: 'Total Value',
          quotationValue: quotationUnpaidValue,
        },
        {
          label: `On Going (Req Date ${nextMonthName})`,
          value: orderProgress,
          quotationLabel: 'Survey On Going',
          quotationValue: orderSurveyOnGoing,
        },
        {
          label: '',
          value: '',
          quotationLabel: 'Survey & No Quotation',
          quotationValue: orderSurveyNoQuotation,
        },
        {
          label: '',
          value: '',
          quotationLabel: 'Survey & Cancel Refund',
          quotationValue: orderSurveyCancelRefund,
        },
        { label: '', value: '', quotationLabel: '', quotationValue: '' },
      ];

      allItems.sort((a, b) => a.type - b.type);

      const itemLength = allItems.length;
      const statusLength = statuses.length;

      const maxLength = Math.max(itemLength, statusLength);

      for (let i = 0; i < maxLength; i++) {
        const status = statuses[i] || ({} as Status);
        const statusText = status.label
          ? `${status.label}: ${status.value}`
          : '';
        const quotationText = status.quotationLabel
          ? `${status.quotationLabel}: ${status.quotationValue}`
          : '';

        const item = allItems[i] || ({} as Item);
        const itemName =
          item.itemName && item.orderCount
            ? `${item.type === 1 ? 'FREE ' : 'PEMASANGAN TANPA SURVEY '}${
                item.itemName
              }: ${item.orderCount}`
            : '';
        const quantity = item.quantity ? `Quantity: ${item.quantity}` : '';

        const row = [
          {
            richText: [{ text: statusText || '', font: { argb: 'FF000000' } }],
          },
          '',
          {
            richText: [
              { text: quotationText || '', font: { argb: 'FF000000' } },
            ],
          },
          '',
          itemName || '',
          quantity || '',
        ];

        example.push(row);
      }

      example.forEach((row) => {
        const newRow = worksheet.addRow(row);
        newRow.font = { size: 12 };
        newRow.alignment = { horizontal: 'left' };
      });

      worksheet.addRow([]);

      worksheet.getColumn(1).width = 45;
      worksheet.getColumn(2).width = 15;
      worksheet.getColumn(3).width = 45;
      worksheet.getColumn(4).width = 15;
      worksheet.getColumn(5).width = 70;
      worksheet.getColumn(6).width = 25;

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {};
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
        const baseName = `DataOrder-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return await generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
