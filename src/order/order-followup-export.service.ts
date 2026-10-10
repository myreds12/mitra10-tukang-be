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

const ORDER_FOLLOWUP_EXPORT_INCLUDE: Prisma.ordersInclude = {
  order_follow_up: {
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
};

@Injectable()
export class OrderFollowUpExportService {
  private readonly logger = new Logger(OrderFollowUpExportService.name);

  constructor(private readonly dbService: PrismaService) {}

  async orderExportExcelFollowUp(res: Response, queryParams: QueryParamsDto) {
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
          include: ORDER_FOLLOWUP_EXPORT_INCLUDE,
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
          include: ORDER_FOLLOWUP_EXPORT_INCLUDE,
        });
        dataExcel = [...dataExcel, ...data];
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order Follow Up', {
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
        { header: 'Order ID', key: 'id', width: 15 },
        { header: 'Tanggal Order', key: 'created_at', width: 20 },
        { header: 'Nama Toko', key: 'store_name', width: 20 },
        { header: 'Nama Customer', key: 'customer_name', width: 20 },
        { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
        { header: 'Status Order', key: 'status_description', width: 20 },
        { header: 'CSI Survei', key: 'csi_survey', width: 25 },
        { header: 'CSI Pengerjaan', key: 'csi_work', width: 25 },
        { header: 'Catatan', key: 'notes', width: 30 },
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

      dataExcel.forEach((order: any) => {
        worksheet.addRow({
          id: order.id,
          created_at: new Date(order.created_at).toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          store_name: order.store?.store_name ?? 'N/a',
          customer_name: order.members?.full_name ?? 'N/a',
          item_name:
            order.m_order_details
              ?.map((item: any) => item.item_name)
              ?.join(', ') || '-',
          status_description: order.status?.description ?? 'N/a',
          csi_survey:
            order.order_follow_up?.[0]?.csi_survey === true ? 'YES' : 'NO',
          csi_work: order.order_follow_up?.[0]?.csi_work === true ? 'YES' : 'NO',
          notes: order.order_follow_up?.[0]?.description || '-',
        });
      });

      const folderPath = './storage/excel/order/follow-up';
      const excelFilePath = createExcelFilePath(
        folderPath,
        `DataOrderFollowUp-${getFormattedDate()}`,
      );

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    } catch (error) {
      this.logger.error('Error orderExportExcelFollowUp:', error);
      throw error;
    }
  }
}
