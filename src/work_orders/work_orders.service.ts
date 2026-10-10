/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { Prisma, users, work_orders } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { VendorService } from 'src/vendor/vendor.service';
import { StatusDetails } from './dto/work-order-status.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { WorkOrdersQueryService } from './work-orders-query.service';
import { WorkOrdersStatusService } from './work-orders-status.service';
import { WorkOrderTukang } from './dto/wo-tukang.dto';

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly dbService: PrismaService,
    private orderService: OrderService,
    private vendorService: VendorService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly whatsAppService: WhatsAppService,
    private violationDetector: ViolationDetectorService,
    private readonly queryService: WorkOrdersQueryService,
    private readonly statusService: WorkOrdersStatusService,
  ) {}

  private async sendTukangAssignedWhatsApp(workOrderId: number) {
    try {
      await this.whatsAppService.sendTukangAssignedNotification(workOrderId);
    } catch (err) {
      console.error('WA assign notification failed:', err);
    }
  }

  async create(
    dataDto: CreateWorkOrderDto,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;

      const { data: order } = await this.orderService.findOne(dataDto.order_id);

      if (!order) throw new BadRequestException('Order not found.');
      if (!order.vendor_id)
        throw new BadRequestException(
          "Order doesn't have any vendor assigned.",
        );

      const evidences:
        | Prisma.work_order_evidencesCreateManyWork_ordersInput[]
        | undefined[] =
        work_order_evidences?.map((evidences) => ({
          evidence_location: evidences.filename,
          created_by: user.id,
        })) ?? [];

      const workOrderTukang: Prisma.work_order_tukangCreateManyWork_ordersInput[] =
        dataDto.work_order_tukang?.map((item) => {
          return {
            type: item.type,
            tukang_id: item.tukang_id,
            created_by: user_id,
          };
        });
      const requestTukang = dataDto.work_order_tukang?.map((item) => {
        return {
          request_tukang: item.tukang_id,
          created_by: user_id,
        };
      });

      const workOrderStatus = {
        status: {
          connect: {
            id: dataDto.work_order_status,
          },
        },
      };

      const work_order_data: Prisma.work_ordersCreateArgs = {
        data: {
          request_work_time: dataDto?.request_work_time
            ? new Date(dataDto.request_work_time)
            : undefined,
          survey_date: dataDto?.survey_date
            ? new Date(dataDto.survey_date)
            : undefined,
          work_start_date: dataDto.work_start_date
            ? new Date(dataDto.work_start_date)
            : undefined,
          work_end_date: dataDto.work_end_date
            ? new Date(dataDto.work_end_date)
            : undefined,
          session: dataDto.session,
          status: {
            connect: {
              id: dataDto.work_order_status,
            },
          },
          order: {
            connect: {
              id: order.id,
            },
          },
          vendor: {
            connect: {
              id: order.vendor_id,
            },
          },
          ...(evidences
            ? {
              work_order_evidences: {
                createMany: {
                  data: evidences,
                },
              },
            }
            : undefined),
          work_order_tukang: {
            createMany: {
              data: workOrderTukang,
            },
          },
          request_tukang: {
            createMany: {
              data: requestTukang,
            },
          },
          work_order_status: {
            create: workOrderStatus,
          },
          created_by: user_id,
        },
      };

      await this.orderService.setStatus(
        order.id,
        dataDto.work_order_status,
        user,
      );

      const [work_order] = await this.dbService.$transaction([
        this.dbService.work_orders.create(work_order_data),
      ]);

      await this.sendTukangAssignedWhatsApp(work_order.id);

      return work_order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async update(
    id: number,
    dataDto: UpdateWorkOrderDto,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const checkWorkOrder = await this.dbService.work_orders.findFirst({
        where: {
          id,
        },
        include: {
          work_order_status: true,
          work_order_tukang: { where: { deleted_at: null } },
        },
      });

      if (!checkWorkOrder)
        throw new BadRequestException('Work Order not exist');

      let updateStatus: number | undefined = undefined;
      let parentId: number | undefined = undefined;
      if (
        dataDto.work_order_status === 7 &&
        checkWorkOrder.work_order_status[0].status_id === 6
      ) {
        updateStatus = dataDto.work_order_status;
        parentId = checkWorkOrder.work_order_status[0].status_id;
      }

      const { id: user_id } = user;
      const evidences: Prisma.work_order_evidencesCreateManyWork_ordersInputEnvelope =
      {
        ...(work_order_evidences
          ? {
            data: work_order_evidences.map((evidences) => ({
              evidence_location: evidences.filename,
              updated_at: new Date(),
              updated_by: user_id,
            })),
          }
          : undefined),
      };

      const tukangUpsert: Prisma.work_order_tukangUpsertWithWhereUniqueWithoutWork_ordersInput[] =
        dataDto?.work_order_tukang?.map((item) => {
          return {
            where: {
              work_order_id: id,
              id: item.id ?? 0,
            },
            update: {
              type: item?.type,
              tukang_id: item?.tukang_id,
            },
            create: {
              type: item.type,
              tukang_id: item.tukang_id,
            },
          };
        });
      const shouldSendAssignedWhatsApp = dataDto.work_order_tukang?.some(
        (item) => {
          if (!item.id) {
            return true;
          }

          const existingTukang = checkWorkOrder.work_order_tukang.find(
            (workOrderTukang) => workOrderTukang.id === item.id,
          );

          return existingTukang?.tukang_id !== item.tukang_id;
        },
      );

      const workOrderStatus: Prisma.work_order_statusCreateWithoutWork_orderInput =
      {
        parent_id: parentId ?? undefined,
        status: {
          connect: {
            id: dataDto.work_order_status,
          },
        },
        work_date_time: dataDto?.status_details?.work_date_time
          ? new Date(dataDto.status_details.work_date_time)
          : undefined,
        work_start_date: dataDto?.status_details?.work_start_date
          ? new Date(dataDto?.status_details?.work_start_date)
          : undefined,
        work_end_date: dataDto?.status_details?.work_end_date
          ? new Date(dataDto?.status_details?.work_end_date)
          : undefined,
        description: dataDto?.status_details?.description,
      };

      console.log('workOrderStatus', workOrderStatus);
      const work_order_data: Prisma.work_ordersUpdateArgs = {
        where: { id },
        data: {
          ...(updateStatus
            ? { status: { connect: { id: dataDto.work_order_status } } }
            : undefined),
          ...(dataDto.order_id
            ? { order: { connect: { id: dataDto.order_id } } }
            : undefined),
          ...(dataDto.vendor_id
            ? { vendor: { connect: { id: dataDto.vendor_id } } }
            : undefined),
          session: dataDto.session,
          request_work_time: dataDto?.request_work_time
            ? new Date(dataDto.request_work_time)
            : undefined,
          survey_date: dataDto?.survey_date ?? undefined,
          work_start_date: dataDto.work_start_date ?? undefined,
          work_end_date: dataDto.work_end_date ?? undefined,
          work_order_evidences: { createMany: { ...(evidences ?? undefined) } },
          work_order_status: { create: workOrderStatus },
          work_order_tukang: { upsert: tukangUpsert },
        },
      };
      const deletedWorkOrderEvidences = dataDto.existing_work_order_evidences
        ? dataDto?.existing_work_order_evidences
          .filter((x) => Boolean(x?.work_order_evidence_id))
          .map((item) => {
            return Number(item.work_order_evidence_id);
          })
        : undefined;

      const deletedWorkOrderTukang = dataDto.work_order_tukang
        ? dataDto?.work_order_tukang
          .filter((x) => Boolean(x.id))
          .map((x) => x.id)
        : undefined;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_syncTukang, _syncEvidence, work_order] =
        await this.dbService.$transaction([
          this.dbService.work_order_tukang.updateMany({
            where: {
              ...(deletedWorkOrderTukang
                ? {
                  id: {
                    notIn: deletedWorkOrderTukang,
                  },
                  work_order_id: id,
                }
                : undefined),
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user.id,
            },
          }),

          this.dbService.work_order_evidences.updateMany({
            where: {
              ...(deletedWorkOrderEvidences
                ? {
                  id: {
                    notIn: deletedWorkOrderEvidences,
                  },
                  work_order_id: id,
                }
                : undefined),
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.work_orders.update(work_order_data),
        ]);

      await this.orderService.setStatus(
        work_order.order_id,
        dataDto.work_order_status,
        user,
      );
      if (shouldSendAssignedWhatsApp) {
        await this.sendTukangAssignedWhatsApp(work_order.id);
      }

      return work_order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async delete(id: number, user_id: number) {
    await this.dbService.work_orders.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });
  }



  // Delegations to WorkOrdersQueryService
  async findAll(queryParamsDto: QueryParamsDto) {
    return this.queryService.findAll(queryParamsDto);
  }

  async findOne(id: number) {
    return this.queryService.findOne(id);
  }

  async calenderWorkOrder(queryParamsDto: QueryParamsDto) {
    return this.queryService.calenderWorkOrder(queryParamsDto);
  }

  // Delegations to WorkOrdersStatusService
  async updateFoto(
    id: number,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    return this.statusService.updateFoto(id, user, work_order_evidences);
  }

  async addFotoBefore(
    id: number,
    user: users,
    work_order_before?: Array<Express.Multer.File>,
  ) {
    return this.statusService.addFotoBefore(id, user, work_order_before);
  }

  async addFotoAfter(
    id: number,
    user: users,
    work_order_after?: Array<Express.Multer.File>,
  ) {
    return this.statusService.addFotoAfter(id, user, work_order_after);
  }

  async deleteFoto(id: number) {
    return this.statusService.deleteFoto(id);
  }

  async setStatusWithMaterials(
    id: number,
    user: users,
    updateData: StatusDetails,
    files: {
      work_order_before?: Express.Multer.File[];
      work_order_after?: Express.Multer.File[];
      report_evidence?: Express.Multer.File[];
    },
  ) {
    return this.statusService.setStatusWithMaterials(id, user, updateData, files);
  }

  async tukangUpdateNotes(
    id: number,
    user: users,
    updateData: WorkOrderTukang,
  ) {
    return this.statusService.tukangUpdateNotes(id, user, updateData);
  }

  async replaceTukang(
    id: number,
    updateDto: UpdateWorkOrderDto,
    user: users,
    files: Express.Multer.File[],
  ) {
    return this.statusService.replaceTukang(id, updateDto, user, files);
  }
}
