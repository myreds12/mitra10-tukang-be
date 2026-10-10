/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberOrderExportService {
  constructor(private readonly dbService: PrismaService) {}

  async orderMemberExportExcel(res: Response, queryParams: QueryParamsDto) {
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
      promotion,
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
        ...(promotion
          ? [
            {
              OR: [
                {
                  payment_type: 'gratis',
                },
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
          member_id: order_by,
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
      { header: 'Nama Toko', key: 'store_name', width: 25 },
      { header: 'Order Dibuat ', key: 'created_at', width: 30 },
      { header: 'Tanggal Request Survey', key: 'request_survey', width: 35 },
      { header: 'Tanggal Request Pengerjaan', key: 'request_work', width: 35 },
      { header: 'Nama Customer', key: 'full_name', width: 40 },
      { header: 'Phone Number', key: 'phone_number', width: 30 },
      { header: 'Payment Type', key: 'payment_type', width: 30 },
      { header: 'Nomor Receipt', key: 'receipt_number', width: 30 },
      { header: 'Order Status', key: 'status_order', width: 30 },
      { header: 'Tanggal Survey', key: 'survey_date', width: 40 },
      { header: 'Tanggal Pengerjaan', key: 'work_date', width: 55 },
      { header: 'Nama Vendor', key: 'company_name', width: 35 },
      { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
      { header: 'Nama Sales', key: 'sales_name', width: 35 },
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
    let totalGrandTotalValue = 0;

    dataExcel.forEach((order) => {
      const tukangName = order?.work_orders?.work_order_tukang
        ? [
          ...new Set(
            order.work_orders.work_order_tukang.map(
              (item) => item?.tukang?.full_name,
            ),
          ),
        ].join(', ')
        : 'Tukang belum ditugaskan';
      const formattedDateTime = (dateTime) =>
        `${new Date(dateTime).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      const grandTotal = Number(order.grand_total);
      const formattedGrandTotal: number = grandTotal ? grandTotal : 0;
      let grandTotalValue = formattedGrandTotal;

      let grandTotalSurveyValue = 0;
      let quotationGrandTotalValue = 0;

      if (order.payment_type === 'survey') {
        const grandTotalSurvey = Number(order.grand_total);
        const quotationGrandTotal =
          order && order.quotation && order.quotation.length > 0
            ? Math.ceil(Number(order.quotation[0]?.quotation_grand_total || 0))
            : 0;

        if (!isNaN(grandTotalSurvey) && !isNaN(quotationGrandTotal)) {
          grandTotalSurveyValue = grandTotalSurvey;
          quotationGrandTotalValue = quotationGrandTotal;
          totalGrandTotalValue += grandTotalSurvey + quotationGrandTotal;
          grandTotalValue = grandTotalSurvey + quotationGrandTotal;
        } else {
          grandTotalValue = 0;
        }
      }

      totalGrandTotalValue +=
        !isNaN(Number()) && order.payment_type != 'survey'
          ? Number(grandTotal)
          : 0;

      const row = worksheet.addRow({
        id: order.id,
        store_name: order.store ? order.store.store_name : 'N/a',
        created_at: formattedDateTime(order.created_at),
        request_survey: order.request_survey
          ? formattedDateTime(order.request_survey)
          : 'Tanggal Belum Ditentukan',
        request_work: order.request_work
          ? formattedDateTime(order.request_work)
          : 'Tanggal Belum Ditentukan',
        full_name: order.members ? order.members.full_name : 'N/a',
        phone_number:
          order?.members?.phone_number ??
          order?.members?.whatsapp_number ??
          order?.members?.member_number ??
          'N/a',
        payment_type:
          order.payment_type === 'pemasangan_tanpa_survey'
            ? 'Pemasangan Tanpa Survey'
            : order.payment_type === 'survey'
              ? 'Survey'
              : order.payment_type === 'gratis'
                ? 'Gratis'
                : 'N/a',
        receipt_number: order.receipt_number
          ? order.receipt_number
          : 'Receipt belum terbit',
        status_order:
          order?.status?.description ?? 'Order Tidak Memiliki Status',
        survey_date: order?.work_orders?.survey_date
          ? formattedDateTime(order.work_orders.survey_date)
          : 'Order Tidak Ada Tanggal Survey',
        work_date:
          order?.work_orders?.work_start_date &&
            order?.work_orders?.work_end_date
            ? `${formattedDateTime(
              order.work_orders.work_start_date,
            )} - ${formattedDateTime(order.work_orders.work_end_date)}`
            : 'Order Tidak Ada Tanggal Survey',
        company_name: order.vendor ? order.vendor.company_name : '-',
        tukang_name: tukangName,
        sales_name: order.sales ? order.sales.full_name : 'N/a',
        grand_total: grandTotalValue,
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

    const totalRow = worksheet.addRow({
      id: 'Total',
      store_name: '',
      created_at: '',
      request_survey: '',
      request_work: '',
      full_name: '',
      phone_number: '',
      payment_type: '',
      receipt_number: '',
      status_order: '',
      survey_date: '',
      work_date: '',
      company_name: '',
      tukang_name: '',
      sales_name: '',
      grand_total: Number(totalGrandTotalValue),
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

    worksheet.mergeCells(`A${totalRow.number}:O${totalRow.number}`);

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
  }
}
