/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto';
import { UpdateRefundDto } from './dto/update-refund.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { OrderService } from 'src/order/order.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class RefundService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
  ) { }
  async create(
    createRefundDto: CreateRefundDto,
    user: users,
    refund_evidences: Express.Multer.File[],
  ) {
    try {
      const { id: user_id } = user;
      const order = await this.dbService.orders.findFirst({
        where: {
          id: createRefundDto.order_id,
        },
        include: {
          work_orders: {
            include: {
              work_order_tukang: true,
            },
          },
        },
      });
      if (!order) throw new BadRequestException('Order not found');
      const evidences:
        | Array<Prisma.refund_evidencesCreateManyRefundInput>
        | undefined =
        refund_evidences?.map((evidence) => ({
          evidence_location: evidence.filename,
          created_by: user_id,
        })) ?? undefined;


      const data: Prisma.refundCreateInput = {
        refund_evidences: {
          create: evidences,
        },
        orders: {
          connect: {
            id: createRefundDto.order_id,
          },
        },
        status: {
          connect: {
            id: createRefundDto.refund_status,
          },
        },
        date_approve: createRefundDto.date_approve
          ? new Date(createRefundDto.date_approve)
          : new Date(),
        date_of_filing: new Date(createRefundDto.date_of_filing),
        notes: createRefundDto.notes,
        reason: createRefundDto.reason,
        approval_number: createRefundDto?.approval_number ?? undefined,
        penalty_nominal: createRefundDto?.penalty_nominal ?? undefined,
        voucher: createRefundDto.voucher ? createRefundDto.voucher : null,
        created_by: user_id,
      };

      const refund = await this.dbService.refund.create({
        data,
      });

      if (refund) {
        await this.notifService.create(
          {
            refund: refund,
            orders: order,
          },
          'CREATE',
          refund.created_by,
          moduleTypeNotification.REFUND,
          refund.id,
          refund.refund_status,
        );
      }

      await this.orderService.setStatus(
        order.id,
        createRefundDto.refund_status,
        user,
      );

      return refund;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        order_by,
        date_from,
        date_to,
        page,
        search,
        status,
        take,
        store_id,
        vendor_id,
        claim_voucher,
        penalty_vendor,
      } = query;
      const skip = page * take - take;
      const where: Prisma.refundWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  !isNaN(Number(search))
                    ? {
                      id: {
                        equals: Number(search),
                      },
                    }
                    : undefined,
                  !isNaN(Number(search))
                    ? {
                      order_id: {
                        equals: Number(search),
                      },
                    }
                    : undefined,
                  { voucher: { contains: search } },
                  { reason: { contains: search } },
                  {
                    orders: {
                      members: {
                        whatsapp_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      members: {
                        phone_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      members: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      store: {
                        store_name: search,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(store_id
            ? [
              {
                orders: {
                  store_id: {
                    in: store_id,
                  },
                },
              },
            ]
            : []),
          ...(Boolean(claim_voucher)
            ? [
              {
                voucher: {
                  not: null,
                },
              },
            ]
            : []),
          ...(Boolean(penalty_vendor)
            ? [
              {
                penalty_nominal: {
                  not: null,
                },
              },
            ]
            : []),
          ...(vendor_id
            ? [
              {
                orders: {
                  vendor_id: vendor_id,
                },
              },
            ]
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
        ].filter(Boolean),
        deleted_at: null,
      };

      const refund = await this.dbService.refund.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          orders: {
            include: {
              members: true,
              store: true,
              vendor: true,
              work_orders: true,
              status: true,
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
                  updated_by: true,
                  created_at: true,
                  updated_at: true,
                },
              },
            },
          },
          refund_evidences: true,
          status: true,
        },
      });

      const count = await this.dbService.refund.count();

      return {
        data: refund,
        meta: {
          total: count,
          skip,
          take,
          page,
          takeTotal: refund.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const refund = await this.dbService.refund.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          refund_evidences: true,
          orders: {
            include: {
              members: true,
              sales: true,
              store: true,
              vendor: true,
              quotation: {
                where: {
                  deleted_at: null,
                },
                include: {
                  quotation_details: {
                    where: {
                      deleted_at: null,
                    }
                  }
                }
              },
              work_orders: {
                include: {
                  work_order_status: {
                    where: {
                      deleted_at: null
                    },
                    include: {
                      status: true
                    }
                  }
                }
              },
              status: true,
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
                  updated_by: true,
                  created_at: true,
                  updated_at: true,
                },
              },
            },
          },
          status: true,
        },
      });

      return refund;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateRefundDto: UpdateRefundDto,
    user: users,
    refunds_evidences: Express.Multer.File[],
  ) {
    try {
      const { id: user_id } = user;

      const evidences: Array<Prisma.refund_evidencesCreateManyRefundInput> =
        refunds_evidences
          ? refunds_evidences.map((evidence) => ({
            evidence_location: evidence.filename,
            created_by: user_id,
          }))
          : undefined;

      const refundConn = {
        ...(updateRefundDto.order_id
          ? {
            orders: {
              connect: {
                id: updateRefundDto.order_id,
              },
            },
          }
          : undefined),
        ...(updateRefundDto.refund_status
          ? {
            status: {
              connect: {
                id: updateRefundDto.refund_status,
              },
            },
          }
          : undefined),
      };
      const refundData: Prisma.refundUpdateInput = {
        date_approve: updateRefundDto.date_approve
          ? new Date(updateRefundDto.date_approve)
          : new Date(),
        date_of_filing: updateRefundDto.date_of_filing
          ? new Date(updateRefundDto.date_of_filing)
          : undefined,
        approval_number: updateRefundDto?.approval_number ?? undefined,
        notes: updateRefundDto?.notes ?? undefined,
        reason: updateRefundDto?.reason ?? undefined,
        penalty_nominal: updateRefundDto.penalty_nominal
          ? updateRefundDto.penalty_nominal
          : null,
        refund_evidences: {
          create: evidences,
        },
        voucher: updateRefundDto.voucher ? updateRefundDto.voucher : null,
        updated_by: user_id,
      };

      const [refundEvidences, refund] = await this.dbService.$transaction([
        this.dbService.refund_evidences.deleteMany({ where: { refund_id: id } }),
        this.dbService.refund.update({
          where: { id },
          data: {
            ...refundConn,
            ...refundData,
          },
          include: {
            orders: {
              include: {
                work_orders: {
                  include: {
                    work_order_tukang: true,
                  },
                },
              },
            },
          },
        })
      ])

      if (refund) {
        await this.notifService.create(
          {
            refund: refund,
            orders: refund.orders,
          },
          'UPDATE',
          refund.updated_by,
          moduleTypeNotification.REFUND,
          refund.id,
          refund.refund_status,
        );
      }

      return refund;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number) {
    return `This action removes a #${id} refund`;
  }

  async refundExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        order_by,
        date_from,
        date_to,
        search,
        status,
        store_id,
        vendor_id,
        penalty_vendor,
      } = queryParams;
      const where: Prisma.refundWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { voucher: { contains: search } },
                  { reason: { contains: search } },
                ],
              },
            ]
            : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(store_id
            ? [
              {
                orders: {
                  store_id: {
                    in: store_id,
                  },
                },
              },
            ]
            : []),
          ...(vendor_id
            ? [
              {
                orders: {
                  vendor_id: vendor_id,
                },
              },
            ]
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
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.refund.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;
        const data = await this.dbService.refund.findMany({
          skip: skipData,
          where,
          orderBy: {
            created_at: order_by,
          },
          include: {
            orders: {
              include: {
                members: true,
                store: true,
                vendor: true,
                work_orders: true,
                status: true,
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
                    updated_by: true,
                    created_at: true,
                    updated_at: true,
                  },
                },
              },
            },
            refund_evidences: true,
            status: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.refund.findMany({
          skip: skipData,
          where,
          orderBy: {
            created_at: order_by,
          },
          include: {
            orders: {
              include: {
                members: true,
                store: true,
                vendor: true,
                work_orders: true,
                status: true,
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
                    updated_by: true,
                    created_at: true,
                    updated_at: true,
                  },
                },
              },
            },
            refund_evidences: true,
            status: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Refund', {
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
        { header: 'Refund ID', key: 'id', width: 15 },
        { header: 'Order ID', key: 'order_id', width: 15 },
        { header: 'Tanggal Persetujuan', key: 'date_approve', width: 25 },
        { header: 'Tanggal Pengajuan', key: 'date_of_filing', width: 25 },
        { header: 'Refund Dibuat', key: 'created_at', width: 25 },
        { header: 'Nama Customer', key: 'member_name', width: 40 },
        { header: 'Nama Toko', key: 'store_name', width: 40 },
        { header: 'Nama Vendor', key: 'vendor_name', width: 40 },
        { header: 'Nama Pemasanngan', key: 'item_name', width: 50 },
        { header: 'Status Order', key: 'status_order', width: 40 },
        { header: 'Status Pembayaran', key: 'paid_status', width: 40 },
        { header: 'Catatan', key: 'notes', width: 40 },
        { header: 'Alasan', key: 'reason', width: 40 },
        { header: 'Nomor Persetujuan', key: 'approval_number', width: 25 },
        { header: 'Voucher', key: 'voucher', width: 25 },
        { header: 'Nominal Penalti', key: 'penalty_nominal', width: 20 },
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

      dataExcel.forEach((refund) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

        const formattedCurrency = (amount) => (amount ? Number(amount) : '0');

        const row = worksheet.addRow({
          id: refund.id,
          order_id: refund.order_id,
          date_approve: refund.date_approve
            ? formattedDateTime(refund.date_approve)
            : 'N/a',
          date_of_filing: formattedDateTime(refund.date_of_filing),
          created_at: formattedDateTime(refund.created_at),
          member_name: refund.orders.members.full_name,
          store_name: refund.orders.store.store_name,
          vendor_name: refund.orders?.vendor?.vendor_name ?? '-',
          item_name: refund?.orders?.m_order_details
            ? refund.orders.m_order_details
              .map((item) => item.item_name)
              .join(', ')
            : '-',
          status_order: refund.orders.members.member_number,
          paid_status:
            refund.paid_status === 0 || null ? 'Belum Dibayar' : 'Dibayar',
          notes: refund.notes,
          reason: refund.reason,
          approval_number: refund.approval_number
            ? refund.approval_number
            : 'N/a',
          voucher: refund.voucher ? refund.voucher : 'N/a',
          penalty_nominal: formattedCurrency(refund.penalty_nominal),
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

      const totalGrandTotal = Boolean(penalty_vendor)
        ? dataExcel.reduce((total, refund) => {
          return (
            total + (refund.orders ? Number(refund.orders.grand_total) : 0)
          );
        }, 0)
        : dataExcel.reduce((total, refund) => {
          return (
            total +
            (refund.penalty_nominal ? Number(refund.penalty_nominal) : 0)
          );
        }, 0);
      const formattedTotalGrandTotal = Number(totalGrandTotal);

      const totalRow = worksheet.addRow({
        id: '',
        order_id: '',
        member_name: '',
        status_order: '',
        store_name: '',
        notes: '',
        reason: '',
        approval_number: '',
        voucher: '',
        penalty_nominal: '',
        date_approve: '',
        date_of_filing: '',
        created_at: '',
      });
      totalRow.getCell('A').value = Boolean(penalty_vendor)
        ? 'Total Penalty'
        : 'Total Pengembalian';
      totalRow.getCell('P').value = formattedTotalGrandTotal;

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
        const folderPath = './storage/excel/refund';
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
        const baseName = `DataRefund-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }
}
