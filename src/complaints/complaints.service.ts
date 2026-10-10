/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { CrmService } from 'src/crm/crm.service';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { ComplaintsExportService } from './complaints-export.service';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    private readonly crmService: CrmService,
    private violationDetector: ViolationDetectorService,
    private readonly complaintsExportService: ComplaintsExportService,
  ) {}

  async create(
    createComplaintDto: CreateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;

      const evidences = complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

      // DEBUG
      console.log('complaint_evidences count:', complaint_evidences?.length);
      console.log('evidences mapped:', evidences);

      // Parallel execution of independent queries
      const [COMPLAINT_STATUS, findOrder] = await Promise.all([
        this.dbService.status.findFirst({
          where: { id: createComplaintDto.complaint_status },
        }),
        this.dbService.orders.findFirst({
          where: { id: createComplaintDto.order_id },
        }),
      ]);

      if (!findOrder) throw new BadRequestException('Order does not exist!');

      const complaintData = {
        orders: { connect: { id: createComplaintDto.order_id } },
        complaint_channels: {
          connect: { id: createComplaintDto.complaint_channel },
        },
        status: { connect: { id: COMPLAINT_STATUS.id } },
        description: createComplaintDto.description,
        crm_type: createComplaintDto.crm_type,
        pic_name: createComplaintDto.pic_name,
        feedback_name: createComplaintDto.feedback_name,
        feedback_role: createComplaintDto.feedback_role,
        complaint_received_date: createComplaintDto.complaint_received_date
          ? new Date(createComplaintDto.complaint_received_date)
          : undefined,
        complaint_date: new Date(createComplaintDto.complaint_date),
        type: createComplaintDto.type,
        created_by: user_id,
        complaint_histories: {
          create: {
            status_id: COMPLAINT_STATUS.id,
            reason: createComplaintDto?.complaint_histories?.reason ?? '',
            created_by: user_id,
            complaint_evidence: { createMany: { data: evidences } },
          },
        },
      };

      const complaint = await this.dbService.complaints.create({
        data: complaintData,
        include: {
          orders: {
            include: {
              work_orders: {
                include: { work_order_tukang: true },
              },
            },
          },
        },
      });

      // Execute notifications and status updates in parallel
      await Promise.all([
        this.notifService.create(
          {
            complaint: complaint,
            orders: complaint.orders,
          },
          'CREATE',
          complaint.created_by,
          moduleTypeNotification.COMPLAINT,
          complaint.id,
          complaint.complaint_status,
        ),
        // this.crmService.syncAnswer(complaint.id),
        this.orderService.setStatus(
          complaint.order_id,
          complaint.complaint_status,
          user,
        ),
        this.orderService.setStatus(complaint.order_id, complaint.complaint_status, user),
      ]);

      // =========================================
      // VENDOR VIOLATION TRIGGER
      // Trigger #8: Customer complaint (jadwal/pengerjaan)
      // =========================================
      if (findOrder?.vendor_id) {
        await this.checkCustomerComplaintViolation(complaint, findOrder);
      }

      // CRM sync separately to capture result in response
      let crm_sync: {
        success: boolean;
        status: number | null;
        data: any;
        error: string | null;
      } = {
        success: false,
        status: null,
        data: null,
        error: null,
      };
      try {
        const crmResult = await this.crmService.syncAnswer(complaint.id);
        crm_sync = {
          success: crmResult?.status === 200,
          status: crmResult?.status ?? null,
          data: crmResult?.data ?? null,
          error: null,
        };
      } catch (error) {
        const err = error as any;
        crm_sync = {
          success: false,
          status: err?.response?.status ?? null,
          data: err?.response?.data ?? null,
          error: err?.message ?? "Unknown error",
        };
      }

      return { ...complaint, crm_sync };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Trigger #8: Customer complaint violation
   * Catat pelanggaran jika komplain customer terkait jadwal/pengerjaan
   */
  private async checkCustomerComplaintViolation(
    complaint: any,
    order: any,
  ): Promise<void> {
    try {
      // Complaint type: 1 = Jadwal, 2 = Pengerjaan
      const complaintTypeText = complaint.type === 1 ? 'jadwal' : 'pengerjaan';

      await this.violationDetector.recordViolation('CUSTOMER_COMPLAINT', {
        vendorId: order.vendor_id,
        orderId: order.id,
        complaintId: complaint.id,
        description: `Komplain customer terkait ${complaintTypeText} untuk order #${
          order.project_number || order.id
        }`,
        // [POIN 6] SYSTEM_GENERATED snapshot — komplain customer tidak punya
        // bukti fisik yang bisa dilampirkan; snapshot event-nya saja.
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: {
            complaintId: complaint.id,
            complaintType: complaint.type, // 1=jadwal, 2=pengerjaan
            orderId: order.id,
            triggeredAt: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      this.logger.error('Error checking customer complaint violation', error);
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        tukang_id,
        store_id,
        vendor_id,
      } = query;
      const skip = page * take - take;

      const where: Prisma.complaintsWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : undefined,
          search
            ? {
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
                        order_id: Number(search),
                      }
                    : undefined,
                  {
                    complaint_channels: {
                      name: { contains: search },
                    },
                  },
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
                  {
                    orders: {
                      sales: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                ],
              }
            : undefined,
          store_id
            ? {
                orders: {
                  store_id: {
                    in: store_id,
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                orders: {
                  vendor_id: {
                    equals: vendor_id,
                  },
                },
              }
            : undefined,
          tukang_id
            ? {
                orders: {
                  work_orders: {
                    work_order_tukang: {
                      some: {
                        tukang_id: tukang_id,
                      },
                    },
                  },
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
      };

      const [complaint, total, complaintGrandTotalAgg] = await Promise.all([
        this.dbService.complaints.findMany({
          take: take <= 0 ? undefined : take,
          skip,
          where,
          orderBy: {
            created_at: order_by,
          },
          include: {
            complaint_channels: true,
            complaint_histories: {
              include: {
                status: true,
              },
            },
            remedials: true,
            status: true,
            orders: {
              include: {
                members: true,
                sales: true,
                store: true,
                status: true,
                vendor: true,
                work_orders: {
                  include: {
                    status: true,
                    work_order_status: {
                      orderBy: {
                        created_at: 'desc',
                      },
                      include: {
                        status: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        this.dbService.complaints.count({
          where,
        }),
        this.dbService.orders.aggregate({
          _sum: {
            grand_total: true,
          },
          where: {
            deleted_at: null,
            complaints: {
              some: {
                deleted_at: null,
              },
            },
          },
        }),
      ]);

      const complaintGrandTotal =
        Number(complaintGrandTotalAgg._sum.grand_total) || 0;
      const totalComplaintPerMonth = {};
      const totalComplaintGrandTotalPerMonth = {};
      const allMonths = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];

      allMonths.forEach((month) => {
        totalComplaintGrandTotalPerMonth[month] = 0;
      });

      complaint.forEach((complaint) => {
        const month = new Date(complaint.created_at).toLocaleString('id-ID', {
          month: 'long',
        });
        const grandTotalPerMonth = Number(complaint.orders.grand_total);

        if (!totalComplaintPerMonth[month]) {
          totalComplaintPerMonth[month] = 0;
        }

        totalComplaintPerMonth[month]++;
        totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
      });

      const monthlyComplaint = allMonths.map((month) => ({
        month,
        totalOrder: totalComplaintPerMonth[month] || 0,
        totalOrderGrandTotalPerMonth:
          totalComplaintGrandTotalPerMonth[month] || 0,
      }));

      return {
        data: complaint,
        meta: {
          total,
          page,
          take,
          skip,
          complaintGrandTotal,
          monthlyComplaint,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          complaint_channels: true,

          complaint_histories: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
            include: {
              status: true,
              complaint_evidence: true,
            },
          },
          remedials: {
            include: {
              remedial_evidences: true,
              status: true,
            },
          },
          status: true,
          orders: {
            include: {
              members: true,
              sales: true,
              status: true,
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
              store: true,
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
                      prices: true,
                      default_price: true,
                      service_name: true,
                    },
                  },
                  item_notes: true,
                  unit_price: true,
                  quantity: true,
                  total: true,
                  comission: true,
                  created_by: true,
                  created_at: true,
                },
              },
              order_files: {
                where: {
                  deleted_at: null,
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
                  quotation_details: {
                    where: {
                      deleted_at: null,
                    },
                  },
                  quotation_files: true,
                },
              },
              work_orders: {
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
                    where: {
                      deleted_at: null,
                      deleted_by: null,
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
              order_history: {
                select: {
                  order_id: true,
                  payload: true,
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
              invoice_details: true,
            },
          },
        },
      });

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateComplaintDto: UpdateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;
      const complaints = await this.dbService.complaints.findFirst({
        where: { id },
      });

      const status = await this.dbService.status.findMany();

      if (!complaints) throw new NotFoundException('Complaint Not Found!');

      await this.dbService.complaint_evidence.updateMany({
        where: {
          complaint_history_id:
            updateComplaintDto?.complaint_histories?.id ?? 0,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      // ✅ Perbaikan: cek apakah ada file sebelum map
      const hasEvidences =
        complaint_evidences && complaint_evidences.length > 0;
      const evidences = hasEvidences
        ? complaint_evidences.map((file) => ({
            evidence_location: file.filename,
            created_by: user_id,
          }))
        : [];

      const orderConn = updateComplaintDto.order_id
        ? { connect: { id: updateComplaintDto.order_id } }
        : undefined;

      const surveyStatusCategories = ['SURVEYREQ', 'SURVEYSTART', 'SURVEYEND'];
      const workStatusCategories = ['WORKREQ', 'WORKSTART', 'WORKEND'];

      const orders = await this.dbService.orders.findFirst({
        where: {
          id: updateComplaintDto?.order_id ?? complaints.order_id,
        },
        include: {
          status: true,
          order_history: {
            where: {
              status: {
                category: {
                  in: [...surveyStatusCategories, ...workStatusCategories],
                },
              },
              deleted_at: null,
            },
            include: { status: true },
            orderBy: { created_at: 'desc' },
            take: 10,
          },
        },
      });

      let statusOrderUpdate;

      const complaintApprovedByHoStatus = status.find((x) =>
        x.category.toLocaleLowerCase().includes('complaintapprovedbyho'),
      )?.id;
      const complaintRejectedByHoStatus = status.find((x) =>
        x.category.toLocaleLowerCase().includes('rejectedbyho'),
      )?.id;

      // ✅ Perbaikan: guard jika order_history kosong
      if (orders?.order_history?.length > 0) {
        if (
          complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
          surveyStatusCategories.includes(
            orders.order_history[0].status.category,
          )
        ) {
          statusOrderUpdate = status.find((x) =>
            x.category.toLowerCase().includes('resurveyreq'),
          )?.id;
        } else if (
          complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
          workStatusCategories.includes(orders.order_history[0].status.category)
        ) {
          statusOrderUpdate = updateComplaintDto.work_status_update;
        } else if (
          complaintRejectedByHoStatus === updateComplaintDto.complaint_status
        ) {
          statusOrderUpdate = orders.order_history[0].status.id;
        }
      }

      const complaint_channelsConn = updateComplaintDto.complaint_channel
        ? { connect: { id: updateComplaintDto.complaint_channel } }
        : undefined;

      // ✅ Perbaikan: filter yang benar [key, value] bukan [value]
      const complaintData: Prisma.complaintsUpdateInput = Object.fromEntries(
        Object.entries({
          orders: orderConn,
          complaint_channels: complaint_channelsConn,
          pic_name: updateComplaintDto.pic_name,
          description: updateComplaintDto.description ?? undefined,
          ...(updateComplaintDto.complaint_received_date
            ? {
                complaint_received_date: new Date(
                  updateComplaintDto.complaint_received_date,
                ),
              }
            : undefined),
          complaint_date: updateComplaintDto.complaint_date
            ? new Date(updateComplaintDto.complaint_date)
            : undefined,
          updated_by: user_id,
          complaint_histories: {
            create: {
              status_id: complaints.complaint_status,
              reason:
                updateComplaintDto?.complaint_histories?.reason ?? undefined,
              created_by: user_id,
              // ✅ Perbaikan: gunakan hasEvidences
              complaint_evidence: hasEvidences
                ? { createMany: { data: evidences } }
                : undefined,
            },
          },
          // ✅ Perbaikan: destructuring yang benar
        }).filter(([key, value]) => value !== undefined),
      );

      const [complaint] = await this.dbService.$transaction([
        this.dbService.complaints.update({
          where: { id },
          data: {
            ...complaintData,
            ...(updateComplaintDto.complaint_status
              ? {
                  status: {
                    connect: {
                      id: updateComplaintDto?.complaint_status,
                    },
                  },
                }
              : undefined),
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
        }),
      ]);

      if (complaint) {
        await this.notifService.create(
          { complaint, orders: complaint.orders },
          'UPDATE',
          complaint.updated_by,
          moduleTypeNotification.COMPLAINT,
          complaint.id,
          complaint.complaint_status,
        );
      }

      if (
        statusOrderUpdate &&
        complaintApprovedByHoStatus === updateComplaintDto.complaint_status
      ) {
        try {
          await this.dbService.work_orders.update({
            where: { order_id: updateComplaintDto.order_id },
            data: {
              status_id: statusOrderUpdate,
              work_order_status: {
                create: {
                  status_id: statusOrderUpdate,
                  created_at: new Date(),
                },
              },
            },
          });
          await this.orderService.setStatus(
            complaint.order_id,
            statusOrderUpdate,
            user,
          );
        } catch (error) {
          throw new BadRequestException('No Work Orders To Update');
        }
      } else if (
        complaintRejectedByHoStatus === updateComplaintDto.complaint_status
      ) {
        await this.orderService.setStatus(
          complaint.order_id,
          statusOrderUpdate,
          user,
        );
      }

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.complaints.delete({
        where: {
          id,
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getCode() {
    try {
      const complaints = await this.dbService.complaints.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return complaints[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatus(id: number, status_id: number, payload: { reason?: string }) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          status: true,
        },
      });

      if (
        !['DRAFTED', 'INVESTIGATE', 'INVESTIGATED'].includes(
          complaint.status.category,
        )
      )
        throw new BadRequestException('Cannot Change Status');

      const data = await this.dbService.complaints.update({
        where: {
          id,
        },
        data: {
          status: {
            connect: {
              id: status_id,
            },
          },
        },
      });

      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async complaintExportExcel(res: Response, queryParams: QueryParamsDto) {
    const { data } = await this.findAll(queryParams);
    return this.complaintsExportService.complaintExportExcel(res, data);
  }
}
