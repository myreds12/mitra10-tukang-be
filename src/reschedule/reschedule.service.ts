import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRescheduleDto } from './dto/create-reschedule.dto';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateRescheduleDto } from './dto/update-reschedule.dto';
import { OrderService } from 'src/order/order.service';
import { PAYMENT_TYPE } from 'src/order/enum/payment_type.enum';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { log } from 'console';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class RescheduleService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService
  ) { }

  async create(
    rescheduleDto: CreateRescheduleDto,
    user: users,
    reschedule_evidences: Express.Multer.File[],
  ) {
    const { id: user_id } = user;
    const order = await this.dbService.orders.findFirst({
      where: {
        id: rescheduleDto.order_id,
      },
      include: {
        status: true,
        work_orders: {
          include: {
            work_order_tukang: true
          }
        },
      },
    });

    const [status] = await this.dbService.status.findMany({
      where: {
        category: {
          contains: 'RESCHEDULE',
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // if (status.some((status) => status === null)) {
    //   throw new Error('One or More Status not found');
    // }

    if (order.status.category === 'DONE') {
      throw new Error('Order is already done');
    }
    const rescheduleStatus: Prisma.reschedule_statusCreateWithoutRescheduleInput =
    {
      status: {
        connect: {
          id: status.id,
        },
      },
      description: rescheduleDto.reschedule_status.description,
      status_by: rescheduleDto.reschedule_status.status_by,
      created_by: user_id,
    };

    const rescheduleEvidences: Prisma.reschedule_evidencesCreateManyRescheduleInput[] =
      reschedule_evidences.map((evidence) => {
        return {
          evidence_location: evidence.filename,
          created_by: user_id,
        };
      });

    const reschedule = await this.dbService.reschedule.create({
      data: {
        order: {
          connect: {
            id: order.id,
          },
        },
        status: {
          connect: {
            id: rescheduleDto.status_id,
          },
        },
        reschedule_date: new Date(rescheduleDto.reschedule_date),
        confirm_date: rescheduleDto.confirm_date
          ? new Date(rescheduleDto.confirm_date)
          : undefined,
        created_by: user_id,
        reschedule_status: {
          create: {
            ...rescheduleStatus,
          },
        },
        reschedule_evidences: {
          createMany: {
            data: rescheduleEvidences,
          },
        },
      },
    });

    if (reschedule) {
      await this.notifService.create(
        {
          reschedule: reschedule,
          orders: order,
        },
        "CREATE",
        reschedule.created_by,
        moduleTypeNotification.RESCHEDULE,
        reschedule.id,
        reschedule.status_id
      );
    }

    await this.orderService.setStatus(order.id, rescheduleDto.status_id, user);

    return reschedule;
  }

  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      status,
      date_from,
      date_to,
      order_by,
      store_id,
      vendor_id,
      tukang_id,
    } = query;
    const skip = page * take - take;

    const where: Prisma.rescheduleWhereInput = {
      AND: [
        ...(search
          ? [
            {
              reschedule_date: {
                lte: new Date(search),
              },
            },
          ]
          : []),
        ...(store_id
          ? [
            {
              order: {
                store_id: {
                  in: store_id,
                },
              },
            },
          ]
          : []),
        ...(tukang_id
          ? [
            {
              order: {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukang_id,
                    },
                  },
                },
              },
            },
          ]
          : []),
        ...(vendor_id
          ? [
            {
              order: {
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
    const reschedule = await this.dbService.reschedule.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      ...(order_by
        ? {
          orderBy: {
            created_at: order_by,
          },
        }
        : {
          orderBy: {
            created_at: 'desc',
          },
        }),
      include: {
        reschedule_tukang: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          include: {
            tukang: true,
          },
        },
        status: true,
        reschedule_status: {
          include: {
            status: true,
          },
        },
        reschedule_evidences: true,
        order: {
          include: {
            members: true,
            store: true,
            sales: true,
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
                updated_by: true,
                created_at: true,
                updated_at: true,
              },
            },
          },
        },
      },
    });
    const countTotal = await this.dbService.reschedule.count();

    const rescheduleGrandTotal = await this.dbService.reschedule
      .findMany({
        where,
        include: {
          order: true,
        },
      })
      .then((data) =>
        data.reduce((acc, curr) => acc + Number(curr.order.grand_total), 0),
      );

    return {
      data: reschedule,
      meta: { countTotal, takeTotal: reschedule.length, page, take, rescheduleGrandTotal },
    };
  }

  async findOne(id: number) {
    const reschedule = await this.dbService.reschedule.findFirst({
      where: {
        id,
      },
      include: {
        reschedule_tukang: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          include: {
            tukang: true,
          },
        },
        status: true,
        reschedule_status: {
          include: {
            status: true,
          },
        },
        reschedule_evidences: true,
        order: {
          include: {
            quotation: {
              where: {
                deleted_at: null
              },
              include: {
                quotation_details: {
                  where: {
                    deleted_at: null
                  }
                }
              }
            },
            members: true,
            store: true,
            sales: true,
            vendor: true,
            work_orders: {
              include: {
                work_order_status: {
                  where: {
                    deleted_at: null
                  },
                  include: {
                    status: true,
                    work_order_items: {
                      where: {
                        deleted_at: null
                      },
                      include: {
                        item: true
                      }
                    }
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
                updated_by: true,
                created_at: true,
                updated_at: true,
              },
            },
          },
        },
      },
    });

    return reschedule;
  }

  async update(
    id: number,
    updateRescheduleDto: UpdateRescheduleDto,
    user: users,
    rescheduleEvidences: Express.Multer.File[],
  ) {
    const { id: userId } = user;

    const order = await this.dbService.orders.findFirst({
      where: { id: updateRescheduleDto.order_id },
      include: {
        status: true,
        work_orders: {
          where: {
            deleted_at: null,
          },
          include: {
            work_order_tukang: true
          }
        },
        order_history: {
          where: {
            status: {
              category: {
                notIn: [
                  'RESCHEDULE',
                  'RESCHEDULEAPPROVEDBYVENDOR',
                  'RESCHEDULEREJECTEDBYVENDOR',
                  'RESCHEDULEAPPROVEDBYHO',
                  'RESCHEDULEBYVENDOR',
                ],
              },
            },
          },
          include: {
            status: true,
          },
          orderBy: {
            created_at: 'desc',
          },
        },
      },
    });
    console.log(order);


    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status.category === 'DONE') {
      throw new Error('Order is already done');
    }

    const status = await this.dbService.status.findFirst({
      where: { id: updateRescheduleDto.status_id },
    });

    const statusRetukangSurvey = await this.dbService.status.findFirst({
      where: {
        category: 'RETUKANGSURVEY'
      },
    });

    const statusRetukangWork = await this.dbService.status.findFirst({
      where: {
        category: 'RETUKANGWORK'
      },
    });
    if (!status) {
      throw new Error('Status not found');
    }

    const rescheduleStatus: Prisma.reschedule_statusUpsertWithWhereUniqueWithoutRescheduleInput =
    {
      where: { id: updateRescheduleDto.reschedule_status.id },
      create: {
        status: {
          connect: { id: updateRescheduleDto.reschedule_status.status_id },
        },
        description: updateRescheduleDto.reschedule_status.description,
        status_by: updateRescheduleDto.reschedule_status.status_by,
        created_by: userId,
      },
      update: {
        status: {
          connect: { id: updateRescheduleDto.reschedule_status.status_id },
        },
        description: updateRescheduleDto.reschedule_status.description,
        status_by: updateRescheduleDto.reschedule_status.status_by,
        updated_by: userId,
        updated_at: new Date(),
      },
    };

    const rescheduleEvidenceData = rescheduleEvidences.map((evidence) => ({
      evidence_location: evidence.filename,
      created_by: userId,
    }));

    const rescheduleTukang: Prisma.reschedule_tukangUpsertWithWhereUniqueWithoutRescheduleInput[] = updateRescheduleDto.reschedule_tukang ?
      updateRescheduleDto.reschedule_tukang.map((item) => {
        return {
          where: {
            id: item?.id ?? 0,
          },
          create: {
            tukang_id: item.tukang_id,
            created_by: userId,
          },
          update: {
            tukang_id: item.tukang_id,
            updated_by: userId,
            updated_at: new Date(),
          },
        };
      }) : [];

    const rescheduleData: Prisma.rescheduleUpdateArgs = {
      where: { id },
      data: {
        ...(status.category.toLowerCase().includes('rescheduleapprovedbyho') ||
          (status.category.toLowerCase().includes('rescheduleapprovedbyvendor') &&
            updateRescheduleDto.confirm_date)
          ? {
            confirm_date: new Date(updateRescheduleDto.confirm_date),
          }
          : undefined),
        status: { connect: { id: updateRescheduleDto.status_id } },
        reschedule_date: new Date(updateRescheduleDto.reschedule_date),
        confirm_date: updateRescheduleDto.confirm_date
          ? new Date(updateRescheduleDto.confirm_date)
          : undefined,
        updated_by: userId,
        updated_at: new Date(),
        reschedule_status: { upsert: rescheduleStatus },
        // reschedule_tukang: { upsert: rescheduleTukang },
        reschedule_evidences: { createMany: { data: rescheduleEvidenceData } },
      },
    };

    console.log('RESCHEDULE DATA:', rescheduleData);

    const [deletedEvidences, updateRescheduleTukang, updatedReschedule] =
      await this.dbService.$transaction([
        this.dbService.reschedule_evidences.updateMany({
          where: { reschedule_id: id },
          data: { deleted_at: new Date(), deleted_by: userId },
        }),
        this.dbService.reschedule_tukang.updateMany({
          where: {
            id: {
              notIn: updateRescheduleDto.reschedule_tukang.map(
                (item) => item.id,
              ),
            },
            reschedule_id: id,
          },
          data: { deleted_at: new Date(), deleted_by: userId },
        }),
        this.dbService.reschedule.update(rescheduleData),
      ]);

    if (updatedReschedule) {
      await this.notifService.create(
        {
          reschedule: updatedReschedule,
          orders: order,
        },
        "UPDATE",
        updatedReschedule.updated_by,
        moduleTypeNotification.RESCHEDULE,
        updatedReschedule.id,
        updatedReschedule.status_id
      );
    }


    if (status.category.toLowerCase().includes('rescheduleapprovedbyho') && order.order_history[0].status.category === 'TUKANGSURVEY' || order.order_history[0].status.category === 'SURVEYREQ' || order.order_history[0].status.category === 'SURVEYSTART') {
      await this.orderService.setStatus(order.id, statusRetukangSurvey.id, user);
    } else if (status.category.toLowerCase().includes('rescheduleapprovedbyho') && order.order_history[0].status.category === 'TUKANGWORK' || order.order_history[0].status.category === 'WORKREQ' || order.order_history[0].status.category === 'WORKSTART') {
      await this.orderService.setStatus(order.id, statusRetukangWork.id, user);
    }

    return updatedReschedule;
  }

  async getCode() {
    const reschedule = await this.dbService.reschedule.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return reschedule[0] || null;
  }

  async rescheduleExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

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
        { header: 'Reschedule ID', key: 'id', width: 15 },
        { header: 'Order ID', key: 'order_id', width: 15 },
        { header: 'Nama Customer', key: 'member_name', width: 40 },
        { header: 'Nomor Member', key: 'member_number', width: 40 },
        { header: 'Nama Toko', key: 'store_name', width: 40 },
        { header: 'Tanggal Reschedule', key: 'reschedule_date', width: 40 },
        { header: 'Order Status', key: 'order_status', width: 40 },
        { header: 'Reschedule Dibuat', key: 'created_at', width: 25 },
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

      data.forEach((refund) => {
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
          member_name: refund.order.members.full_name,
          member_number: refund.order.members.member_number,
          store_name: refund.order.store.store_name,
          reschedule_date: refund.reschedule_date ? refund.reschedule_date : '',
          order_status: refund.order.status.description,
          created_at: formattedDateTime(refund.created_at),
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

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/reschedule';
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
