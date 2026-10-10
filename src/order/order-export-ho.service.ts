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

const ORDER_EXPORT_HO_INCLUDE: Prisma.ordersInclude = {
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
};

@Injectable()
export class OrderExportHoService {
  private readonly logger = new Logger(OrderExportHoService.name);

  constructor(private readonly dbService: PrismaService) {}

  async orderExportExcelHO(res: Response, queryParams: QueryParamsDto) {
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
          include: ORDER_EXPORT_HO_INCLUDE,
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.orders.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            created_at: order_by,
          },
          include: ORDER_EXPORT_HO_INCLUDE,
        });
        dataExcel = [...dataExcel, ...data];
      }

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
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Order Dibuat ', key: 'created_at', width: 30 },
        { header: 'Tanggal Request Survey', key: 'request_survey', width: 30 },
        {
          header: 'Tanggal Permintaan Survey',
          key: 'surveyreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Survey Dimulai',
          key: 'surveystart_date',
          width: 30,
        },
        { header: 'Tanggal Survey Selesai', key: 'surveyend_date', width: 30 },
        {
          header: 'Tanggal Permintaan Pengerjaan',
          key: 'workreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Dimulai',
          key: 'workstart_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Berakhir',
          key: 'workend_date',
          width: 30,
        },
        { header: 'Nama Customer', key: 'full_name', width: 35 },
        { header: 'Alamat', key: 'address', width: 40 },
        { header: 'Nomor Telepon Customer', key: 'member_number', width: 35 },
        { header: 'Jenis Pengerjaan', key: 'payment_type', width: 30 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 40 },
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

      dataExcel.forEach((order) => {
        const tukangName = order.work_orders
          ? order.work_orders.work_order_tukang
            .map((item) => item?.tukang?.full_name)
            .join(', ')
          : 'N/a';
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const row = worksheet.addRow({
          id: order.id,
          store_name: order.store ? order.store.store_name : 'N/a',
          full_name: order.members ? order.members.full_name : 'N/a',
          address: order.members.address_1
            ? order.members.address_1
            : order.members.address_2,
          member_number: order.members.phone_number
            ? order.members.phone_number
            : order.members.whatsapp_number,
          payment_type:
            order.payment_type === 'pemasangan_tanpa_survey'
              ? 'Pemasangan Tanpa Survey'
              : order.payment_type === 'survey'
                ? 'Survey'
                : order.payment_type === 'gratis'
                  ? 'Gratis'
                  : 'N/a',
          tukang_name: tukangName,
          created_at: formattedDateTime(order.created_at),
          request_survey: order.request_survey
            ? formattedDateTime(order.request_survey)
            : 'N/a',
          surveyreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyreq'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveyreq'),
              ).created_at,
            )
            : 'N/a',
          surveystart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveystart'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveystart'),
              ).created_at,
            )
            : 'N/a',
          surveyend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyend'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('surveyend'),
              ).created_at,
            )
            : 'N/a',
          workreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workreq'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workreq'),
              ).created_at,
            )
            : 'N/a',
          workstart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workstart'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workstart'),
              ).created_at,
            )
            : 'N/a',
          workend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workend'),
          )
            ? formattedDateTime(
              order.order_history.find((i) =>
                i.status.category.toLowerCase().includes('workend'),
              ).created_at,
            )
            : 'N/a',
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

      const folderPath = './storage/excel/order';
      const excelFilePath = createExcelFilePath(
        folderPath,
        `DataOrder-${getFormattedDate()}`,
      );

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    } catch (error) {
      this.logger.error('Error orderExportExcelHO:', error);
      throw error;
    }
  }
}
