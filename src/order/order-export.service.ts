/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import {
  createExcelFilePath,
  getFormattedDate,
  writeWorkbookAndSendResponse,
} from 'src/common/utils/excel.util';

@Injectable()
export class OrderExportService {
  private readonly logger = new Logger(OrderExportService.name);

  constructor(private readonly dbService: PrismaService) {}

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

        for (const order of batch) {
          const details =
            order.m_order_details?.length > 0
              ? order.m_order_details
              : [{ item_name: null, quantity: null, item: null }];

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

            const grandTotal = Number(order.grand_total) || 0;
            let grandTotalValue = 0;
            let grandTotalSurveyValue = 0;
            let quotationGrandTotalValue = 0;

            if (isFirstDetail) {
              if (order.payment_type === 'survey') {
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
                grandTotalValue = grandTotal;
                totalGrandTotalValue += grandTotal;
              }
            }

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
      const folderPath = './storage/excel/order';
      const excelFilePath = createExcelFilePath(
        folderPath,
        `DataOrder-${getFormattedDate()}`,
      );

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    } catch (error) {
      this.logger.error('Error orderExportExcel:', error);
      throw error;
    }
  }
}
