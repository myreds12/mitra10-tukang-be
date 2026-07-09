/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { Prisma, users, work_orders } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { VendorService } from 'src/vendor/vendor.service';
import { StatusDetails } from './dto/work-order-status.dto';
import { ReplaceTukangStatus } from './enum/replace-tukang.enum';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WorkOrderTukang } from './dto/wo-tukang.dto';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly dbService: PrismaService,
    private orderService: OrderService,
    private vendorService: VendorService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly whatsAppService: WhatsAppService,
  ) { }

  private async sendWorkOrderStatusWhatsApp(workOrderId: number) {
    try {
      await this.whatsAppService.sendWorkOrderStatusNotification(workOrderId);
    } catch (err) {
      console.error('WA status notification failed:', err);
    }
  }

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

      await this.sendWorkOrderStatusWhatsApp(work_order.id);
      await this.sendTukangAssignedWhatsApp(work_order.id);

      return work_order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        status,
        tukang_id,
        vendor_id,
      } = queryParamsDto;

      const skip = page * take - take;
      const where: Prisma.work_ordersWhereInput = {
        AND: [
          search
            ? {
              OR: [
                {
                  id: !isNaN(+search) ? +search : undefined,
                },
                {
                  order: {
                    members: {
                      whatsapp_number: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    members: {
                      phone_number: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    members: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    sales: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  order: {
                    store: {
                      store_name: {
                        contains: search,
                      },
                    },
                  },
                },
              ],
            }
            : undefined,
          status ? { status: { id: { in: status } } } : undefined,
          vendor_id
            ? {
              vendor_id: vendor_id,
            }
            : undefined,
          tukang_id
            ? {
              work_order_tukang: {
                some: {
                  tukang_id: tukang_id,
                },
              },
            }
            : undefined,
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };

      const total = await this.dbService.work_orders.count({
        where,
      });

      const work_orders = await this.dbService.work_orders.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
            },
          },
          request_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            where: {
              deleted_at: null,
            },
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
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
          work_order_evidences: true,
        },
      });

      const userIds = [
        ...new Set(
          work_orders
            .flatMap((item) => [
              item.created_by,
              item.updated_by,
              item.deleted_by,
              ...item.work_order_status.map((status) => status.created_by),
            ])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({
          ...acc,
          [user.id]: user,
        }),
        {},
      );

      const workOrdersWithUser = work_orders.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
        work_order_status: item.work_order_status.map((status) => ({
          ...status,
          created_by: status.created_by
            ? userMap[status.created_by] || null
            : null,
        })),
      }));

      return {
        data: workOrdersWithUser,
        meta: { skip, page, take, total },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const work_orders = await this.dbService.work_orders.findFirst({
        where: {
          id,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
              order_history: {
                include: {
                  status: true,
                },
              },
            },
          },
          request_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            where: {
              deleted_at: null,
            },
            orderBy: { created_at: 'desc' },
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          status: true,
          work_order_evidences: true,
        },
      });

      if (!work_orders) throw Error('Work Order Not Found!');

      // Get user IDs from work order and order history
      const userIds = [
        work_orders.created_by,
        work_orders.updated_by,
        work_orders.deleted_by,
        ...work_orders.order.order_history.map((history) => history.created_by),
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the work_orders and order history
      const workOrdersWithUser = {
        ...work_orders,
        created_by: userMap[work_orders.created_by] || null,
        updated_by: userMap[work_orders.updated_by] || null,
        deleted_by: userMap[work_orders.deleted_by] || null,
        order: {
          ...work_orders.order,
          order_history: work_orders.order.order_history.map((history) => ({
            ...history,
            created_by: userMap[history.created_by] || null,
          })),
        },
      };

      return workOrdersWithUser;
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
      await this.sendWorkOrderStatusWhatsApp(work_order.id);
      if (dataDto.work_order_tukang?.length) {
        await this.sendTukangAssignedWhatsApp(work_order.id);
      }

      return work_order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async updateFoto(
    id: number,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const checkWorkOrder = await this.dbService.work_order_evidences.findFirst({
        where: {
          id,
        },
      });

      if (!checkWorkOrder)
        throw new BadRequestException('Work Order Evidencae not exist');



      const { id: user_id } = user;
      await Promise.all(
        work_order_evidences.map(async (evidence) => {
          await this.dbService.work_order_evidences.updateMany({
            where: {
              id: checkWorkOrder.id, // Pastikan `id` tersedia di evidence
            },
            data: {
              evidence_location: evidence.filename,
              updated_at: new Date(),
              updated_by: user_id,
            },
          });
        })
      );




      return checkWorkOrder;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  async addFotoBefore(
    id: number,
    user: users,
    work_order_before?: Array<Express.Multer.File>,
  ) {
    try {

      const { id: user_id } = user;
      const res = await Promise.all(
        work_order_before.map(async (evidence) => {
          await this.dbService.work_order_evidences.create({
            data: {
              work_order_id: id,
              evidence_location: evidence.filename,
              created_by: user_id,
              created_at: new Date(),
              type: 2,
            },
          });
        })
      );




      return res;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async addFotoAfter(
    id: number,
    user: users,
    work_order_after?: Array<Express.Multer.File>,
  ) {
    try {

      const { id: user_id } = user;
      const res = await Promise.all(
        work_order_after.map(async (evidence) => {
          await this.dbService.work_order_evidences.create({
            data: {
              work_order_id: id,
              evidence_location: evidence.filename,
              created_by: user_id,
              created_at: new Date(),
              type: 3,
            },
          });
        })
      );




      return res;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async deleteFoto(
    id: number,
  ) {
    try {
      const checkWorkOrder = await this.dbService.work_order_evidences.delete({
        where: {
          id,
        },
      });
      console.log(checkWorkOrder);

      if (!checkWorkOrder)
        throw new BadRequestException('Work Order Evidencae not exist');

      return checkWorkOrder;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatusWithMaterials(
    id: number,
    user: users,
    updateData: StatusDetails,
    files: {
      work_order_before?: Express.Multer.File[];
      work_order_after?: Express.Multer.File[];
    },
  ): Promise<work_orders> {
    try {
      console.log(user);

      console.log('PAYLOAD', updateData);

      const { id: user_id } = user;
      const workOrder = await this.dbService.work_orders.findFirst({
        where: {
          id,
        },
        include: {
          order: {
            include: {
              m_order_details: {
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: true,
            },
          },
          vendor: true,
          work_order_status: {
            where: {
              deleted_at: null,
            },
            orderBy: { created_at: 'desc' },
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
          },
          status: true,
          work_order_evidences: true,
        },
      });

      if (!workOrder) throw new BadRequestException('Work Order not exist');

      const [NEW_STATUS] = await this.dbService.status.findMany({
        where: { id: updateData.status_id },
        orderBy: { category: 'desc' },
      });

      const evidencesBefore: Array<Prisma.work_order_evidencesCreateManyWork_ordersInput> =
        files.work_order_before?.map((evidences) => ({
          evidence_location: evidences.filename,
          created_by: user_id,
          type: 2,
        }));

      const evidencesAfter: Array<Prisma.work_order_evidencesCreateManyWork_ordersInput> =
        files.work_order_after?.map((evidences) => ({
          evidence_location: evidences.filename,
          created_by: user_id,
          type: 3,
        }));

      const evidences = [].concat(evidencesBefore ?? [], evidencesAfter ?? []);

      const deletedWorkOrderEvidences = updateData.existing_work_order_evidences
        ? updateData?.existing_work_order_evidences
          .filter((x) => Boolean(x?.work_order_evidence_id))
          .map((item) => {
            return Number(item.work_order_evidence_id);
          })
        : undefined;

      console.log(deletedWorkOrderEvidences, "DELETED WORK ORDER EVIDENCES")
      const recentWorkStatus = workOrder.work_order_status.find(
        (x) => x.status_id === NEW_STATUS.id,
      );

      console.log(recentWorkStatus, 'RECENT_STATUS');

      const upsertItems: Prisma.work_order_itemsUpsertWithWhereUniqueWithoutWork_order_statusInput[] =
        updateData.work_order_items
          ? updateData.work_order_items.map((x) => ({
            where: {
              id: x?.id ?? 0,
              work_order_status_id: recentWorkStatus?.id ?? 0,
            },
            create: {
              item_id: x?.item_id ?? undefined,
              name: x?.item_name ?? undefined,
              tukang_id: x.tukang_id ?? undefined,
              tukang_name: x.tukang_name ?? undefined,
              type: x.type,
              is_customer: Boolean(x.is_customer),
              quantity: x.quantity ?? undefined,
              unit: x?.unit ?? undefined,
            },
            update: {
              item_id: x.item_id ?? undefined,
              name: x.item_name ?? undefined,
              tukang_id: x.tukang_id ?? undefined,
              tukang_name: x.tukang_name ?? undefined,
              type: x.type,
              quantity: x.quantity ?? undefined,
              is_customer: Boolean(x.is_customer),
              unit: x?.unit ?? undefined,
            },
          }))
          : undefined;
      console.log(upsertItems, 'WORK ORDER ITEMS');

      const workOrderStatusUpsert: Prisma.work_order_statusUpsertWithWhereUniqueWithoutWork_orderInput =
      {
        where: {
          status_id: NEW_STATUS.id,
          id: recentWorkStatus?.id ?? 0,
        },
        create: {
          status_id: NEW_STATUS.id,
          description: updateData.description,
          work_start_date: updateData.work_end_date,
          work_end_date: updateData.work_end_date,
          work_date_time: updateData.work_date_time,
          created_at: new Date(),
          created_by: user.id,
          ...(updateData.work_order_items
            ? {
              work_order_items: {
                createMany: { data: upsertItems.map((x) => x.create) },
              },
            }
            : undefined),
        },
        update: {
          description: updateData.description,
          work_start_date: updateData.work_end_date,
          work_end_date: updateData.work_end_date,
          work_date_time: updateData.work_date_time,
          updated_at: new Date(),
          updated_by: user.id,
          work_order_items: { upsert: upsertItems },
        },
      };


      await this.dbService.$transaction([
        ...(updateData.work_order_items
          ? [
            this.dbService.work_order_items.updateMany({
              where: {
                id: {
                  notIn: updateData.work_order_items
                    .filter((x) => Boolean(x?.id))
                    .map((x) => x.id),
                },
                work_order_status_id: recentWorkStatus?.id ?? 0,
                work_order_status: {
                  status_id: NEW_STATUS?.id ?? 0,
                  work_order: {
                    id,
                  },
                },
              },
              data: {
                deleted_at: new Date(),
                deleted_by: user.id,
              },
            }),
          ]
          : []),
        ...(deletedWorkOrderEvidences
          ? [
            this.dbService.work_order_evidences.updateMany({
              where: {
                id: {
                  in: deletedWorkOrderEvidences,
                },
                work_order_id: id,
              },
              data: {
                deleted_at: new Date(),
                deleted_by: user_id,
              },
            })
          ] : []),
        // this.dbService.work_order_status.updateMany({
        //   where: {
        //     id: recentWorkStatus?.id ?? 0,
        //     work_order_id: id,
        //   },
        //   data: {
        //     deleted_at: new Date(),
        //     deleted_by: user.id,
        //   },
        // }),
        this.dbService.work_orders.update({
          where: { id },
          data: {
            status_id: NEW_STATUS.id,
            work_order_evidences: { createMany: { data: evidences } },
            updated_at: new Date(),
            updated_by: user.id,
            work_order_status: {
              upsert: workOrderStatusUpsert,
            },
          },
        }),
      ]);

      const work_order = await this.dbService.work_orders.findUnique({
        where: { id },
      });
      await this.orderService.setStatus(
        work_order.order_id,
        updateData.status_id,
        user,
      );
      await this.sendWorkOrderStatusWhatsApp(work_order.id);
      return work_order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async tukangUpdateNotes(
    id: number,
    user: users,
    updateData: WorkOrderTukang,
  ) {
    try {
      const workOrder = await this.dbService.work_orders.findFirst({
        where: {
          id,
        },
        include: {
          request_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              work_orders: {
                include: {
                  work_order_tukang: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      tukang: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!workOrder) throw new BadRequestException('Work Order not exist');

      const workOrderTukang = await this.dbService.$transaction([
        this.dbService.work_order_tukang.updateMany({
          where: {
            work_order_id: id,
            tukang_id: updateData.tukang_id,
            deleted_at: null,
          },
          data: {
            notes: updateData.notes,
            updated_by: user.id,
            updated_at: new Date(),
          },
        }),
      ]);

      return workOrderTukang;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async replaceTukang(
    id: number,
    updateDto: UpdateWorkOrderDto,
    user: users,
    files: Express.Multer.File[],
  ) {
    try {
      const evidences = files.map((file) => ({
        evidence_location: file.filename,
        created_by: user.id,
      }));

      const upsertResults = await this.dbService.$transaction(
        async (transaction) => {
          const results = await Promise.all(
            updateDto.replace_tukang?.map(async (item) => {
              const data = {
                where: { id: item.id ?? 0 },
                create: {
                  work_order_id: id,
                  request_tukang: item.tukang_id,
                  notes: item.notes
                    ? `CREATED: ${item.notes.replace(/\n/g, '\nCREATED: ')}`
                    : '',
                  created_by: user.id,
                  created_at: new Date(),
                  request_tukang_evidence: { createMany: { data: evidences } },
                },
                update: {
                  tukang_replace: item.tukang_id,
                  status: item.status,
                  notes: item.notes
                    ? `${ReplaceTukangStatus[item.status]
                    }: ${item.notes.replace(
                      /\n/g,
                      `\n${ReplaceTukangStatus[item.status]}: `,
                    )}`
                    : ReplaceTukangStatus[item.status],
                  updated_by: user.id,
                  updated_at: new Date(),
                  request_tukang_evidence: { createMany: { data: evidences } },
                },
              };

              const existingRequestTukang =
                await transaction.request_tukang.findUnique({
                  where: { id: item.id },
                  select: { request_tukang: true },
                });

              data.create.request_tukang = existingRequestTukang.request_tukang;

              return transaction.request_tukang.upsert(data);
            }),
          );

          if (
            updateDto.replace_tukang?.some(
              (item) => item.status === ReplaceTukangStatus.APPROVE,
            )
          ) {
            const tukangIds = updateDto.replace_tukang.map(
              (item) => item.tukang_id,
            );

            await transaction.work_order_tukang.updateMany({
              where: {
                work_order_id: id,
                tukang_id: {
                  in: tukangIds,
                },
              },
              data: {
                deleted_at: new Date(),
                deleted_by: user.id,
              },
            });

            const workOrderTukangData = updateDto.replace_tukang.map(
              (item) => ({
                work_order_id: id,
                tukang_id: item.tukang_id,
                created_by: user.id,
                created_at: new Date(),
              }),
            );

            await transaction.work_order_tukang.createMany({
              data: workOrderTukangData,
            });
          }

          return results;
        },
      );

      if (
        updateDto.replace_tukang?.some(
          (item) => item.status === ReplaceTukangStatus.APPROVE,
        )
      ) {
        await this.sendTukangAssignedWhatsApp(id);
      }

      const roles = (
        await this.dbService.users.findUniqueOrThrow({
          where: { id: user.id },
          select: { roles: { select: { name: true } } },
        })
      ).roles.name;
      if (roles.includes('Owner Vendor') || roles.includes('Admin Vendor')) {
        upsertResults.forEach((result) => {
          if (result.status === ReplaceTukangStatus.WAITING_FOR_APPROVVE) {
            this.emailQueue.add('send-replace-tukang-from-vendor', {
              module_id: result.tukang_replace,
            });
          }
        });
      } else if (roles.includes('Tukang')) {
        this.emailQueue.add('send-replace-tukang-from-tukang', {
          module_id: user.id,
        });
      }

      return upsertResults;
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

  async calenderWorkOrder(queryParamsDto: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        status,
        tukang_id,
        vendor_id,
      } = queryParamsDto;
      console.log(tukang_id);

      const skip = page * take - take;
      const where: Prisma.work_ordersWhereInput = {
        AND: [
          search
            ? {
              OR: [
                ...(isNaN(Date.parse(search))
                  ? []
                  : [
                    { request_work_time: { equals: new Date(search) } },
                    { survey_date: { equals: new Date(search) } },
                    { work_start_date: { equals: new Date(search) } },
                    { work_end_date: { equals: new Date(search) } },
                  ]),
                {
                  order: {
                    members: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
              ],
            }
            : undefined,
          status ? { status: { id: { in: status } } } : undefined,
          vendor_id
            ? {
              vendor_id: vendor_id,
            }
            : undefined,
          tukang_id
            ? {
              work_order_tukang: {
                some: {
                  tukang_id: tukang_id,
                },
              },
            }
            : undefined,
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };

      const total = await this.dbService.work_orders.count({
        where,
      });

      const work_orders = await this.dbService.work_orders.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: [
          {
            status: {
              status_urgency: 'desc',
            },
          },
        ],
        include: {
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
            },
          },
          request_tukang: {
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
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
          work_order_evidences: true,
        },
      });

      return {
        data: work_orders,
        meta: { skip, page, take, total },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
