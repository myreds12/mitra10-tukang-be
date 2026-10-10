/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';

@Injectable()
export class VendorExportService {
  constructor(private readonly dbService: PrismaService) {}

  async vendorExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        date_from,
        date_to,
        store_id,
        order_date_from,
        order_date_to,
        is_paid,
        is_promotion
      } = queryParams;
      // ...(Boolean(top_best)
      //       ? {
      //           order_total: 'desc',
      //         }
      //       : {
      //           created_at: order_by,
      //         }),
      // now.setHours(0, 0, 0, 0);
      const formattedDate = new Date().toISOString().split('T')[0];

      const skip = page * take - take;

      const where: Prisma.vendorWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  { phone_number: { contains: search } },
                  { email_address: { contains: search } },
                  { company_name: { contains: search } },
                  {
                    pic_name: {
                      contains: search
                    }
                  }
                ],
              },
            ]
            : []),
          ...(store_id
            ? [
              {
                vendor_store: { some: { store_id: { in: store_id } } },
              },
            ]
            : []),
          ...(date_from && date_to
            ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23: 59: 59.000Z`),
                },
              },
            ]
            : []),
          ...(is_paid === 1
            ? [
              {
                orders: {
                  some: {
                    deleted_at: null,
                    quotation: {
                      some: {
                        deleted_at: null,
                        receipt_quotation: { not: null },
                      },
                    },
                  },
                },
              },
            ]
            : is_paid === 0 ? [
              {
                orders: {
                  some: {
                    deleted_at: null,
                    quotation: {
                      some: {
                        deleted_at: null,
                        receipt_quotation: null,
                      },
                    },
                  },
                },
              },
            ] : []),
          ...(order_date_from && order_date_to ? [
            {
              orders: {
                some: {
                  deleted_at: null,
                  created_at: {
                    gte: new Date(order_date_from),
                    lte: new Date(`${order_date_to}T23: 59: 59.000Z`),
                  }
                }
              }
            }
          ] : []),

        ].filter(Boolean),
        deleted_at: null,
      };

      const data = await this.dbService.vendor.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        include: {
          ...(take > 0 && {
            orders: {
              where: {
                deleted_at: null,
                ...(order_date_from && order_date_to ? {
                  created_at: {
                    gte: new Date(order_date_from),
                    lte: new Date(`${order_date_to}T23: 59: 59.000Z`),
                  }
                } : {}),
                ...(is_paid === 1 ? {
                  quotation: {
                    some: {
                      deleted_at: null,
                      receipt_quotation: { not: null },
                    },
                  }
                } : is_paid === 0 && {
                  quotation: {
                    some: {
                      deleted_at: null,
                      receipt_quotation: null,
                    },
                  }
                }),
                ...(is_promotion === 1 ? {
                  payment_type: {
                    not: 'survey'
                  }
                } : is_promotion === 0 ? {
                  payment_type: 'survey'
                } : {}),
              },
              orderBy: {
                created_at: 'desc',
              },
              include: {
                status: true,
                quotation: {
                  where: {
                    deleted_at: null,
                    ...(is_paid === 1
                      ? {
                        receipt_quotation: {
                          not: null
                        }
                      }
                      : is_paid === 0 && {
                        receipt_quotation: null
                      }),
                  },
                  include: {
                    quotation_receipt: {
                      where: {
                        deleted_at: null
                      }
                    }
                  }
                },
              },
            }
          }),
          tukang: {
            include: {
              work_order_tukang: {
                where: {
                  deleted_at: null,
                },
                orderBy: {
                  created_at: 'desc',
                },
                include: {
                  work_orders: {
                    include: {
                      status: true,
                      work_order_status: true,
                    },
                  },
                },
              },
            },
          },
          pic_vendor: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                  roles: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          vendor_area: {
            where: {
              deleted_at: null,
            },
            include: {
              area: true,
            },
          },
          bank: true,
          vendor_document: true,
          vendor_service: {
            where: {
              deleted_at: null,
            },
            include: {
              service_type: true,
            },
          },
          vendor_store: {
            where: {
              deleted_at: null,
            },
            select: {
              id: true,
              vendor_id: true,
              created_at: true,
              deleted_at: true,
              store: {
                select: {
                  id: true,
                  store_name: true,
                  additional_address: true,
                  address: true,
                  bank_account: true,
                  bank_name: true,
                  bank_number: true,
                  email: true,
                  phone_number_1: true,
                  phone_number_2: true,
                  area_id: true,
                  area: true,
                },
              },
            },
          },
          work_orders: {
            where: {
              // survey_date: new Date(),
              deleted_at: null,
              OR: [
                {
                  survey_date: {
                    gte: new Date(`${formattedDate}T00:00:00.000Z`),
                    lte: new Date(`${formattedDate}T23: 59: 59.000Z`),
                  },
                },
                {
                  work_start_date: {
                    gte: new Date(`${formattedDate}T00:00:00.000Z`),
                  },
                  work_end_date: {
                    lte: new Date(`${formattedDate}T23: 59: 59.000Z`),
                  },
                },
              ],
            },
          },
        },
      });

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
        { header: 'Vendor Id', key: 'id', width: 10 },
        { header: 'Nama PIC', key: 'pic_name', width: 25 },
        { header: 'Nama Perusahaan', key: 'company_name', width: 20 },
        { header: 'Email', key: 'email_address', width: 25 },
        { header: 'Phone Number', key: 'phone_number', width: 30 },
        { header: 'Service Type', key: 'vendor_service', width: 50 },
        { header: 'Serving Store', key: 'vendor_store', width: 50 },
        { header: 'Serving Area', key: 'vendor_area', width: 50 },
        { header: 'Username', key: 'username', width: 50 },
        { header: 'Tanggal Join', key: 'join_date', width: 30 },
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

      data.forEach((vendor) => {
        const dateTime = new Date(vendor.join_date ?? vendor.created_at);
        const formattedDateTime = `${dateTime.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${dateTime.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
        const serviceType = vendor.vendor_service
          ? vendor.vendor_service
            .map((service) => service.service_type.service_type)
            .join(',')
          : '';
        const servingStore = vendor.vendor_store
          ? vendor.vendor_store
            .map((service) => service.store.store_name)
            .join(',')
          : '';
        const servingArea = vendor.vendor_area
          ? vendor.vendor_area.map((service) => service.area.area).join(',')
          : '';
        const row = worksheet.addRow({
          id: vendor.id,
          pic_name: vendor.pic_name ? vendor.pic_name : '',
          company_name: vendor.company_name ? vendor.company_name : '',
          email_address: vendor.email_address ? vendor.email_address : '',
          phone_number: vendor.phone_number ? vendor.phone_number : '',
          vendor_service: serviceType,
          vendor_store: servingStore,
          vendor_area: servingArea,
          username: vendor.pic_vendor
            ? vendor.pic_vendor
              .map(
                (item) =>
                  `${item.users.username || 'N/a'}(${item.users.roles.name || 'Tidak Ada Role'
                  })`,
              )
              .join(', ')
            : '',
          join_date: formattedDateTime,
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

      const grandTotal: number = data
        .map((vendor) =>
          vendor.orders.reduce((acc, order) => {
            return acc + Number(order.grand_total);
          }, 0),
        )
        .reduce((acc, total) => acc + total, 0);

      //
      const formattedGrandTotal = !isNaN(grandTotal)
        ? new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
        }).format(grandTotal)
        : 'Rp. 0';
      const totalRow = worksheet.addRow({
        id: 'Orders Grand Total',
        pic_name: '',
        company_name: '',
        email_address: '',
        phone_number: '',
        vendor_service: '',
        vendor_store: '',
        vendor_area: '',
        username: '',
        join_date: formattedGrandTotal,
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

      worksheet.mergeCells(`A${totalRow.number}:J${totalRow.number}`);

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './storage/excel/vendor';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const excelFileName = `${baseName}.xlsx`;
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
        const tanggalDalamFormat = getFormattedDate();
        const baseName = `DataVendor-${tanggalDalamFormat}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }

}
