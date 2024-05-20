import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { Prisma, users, work_orders } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { VendorService } from 'src/vendor/vendor.service';
import { StatusDetails } from './dto/work-order-status.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly dbService: PrismaService,
    private orderService: OrderService,
    private vendorService: VendorService,
  ) {}

  async create(
    dataDto: CreateWorkOrderDto,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;

    const order = await this.orderService.findOne(dataDto.order_id);

    if (!order) throw new BadRequestException('Order not found.');
    if (!order.vendor_id)
      throw new BadRequestException("Order doesn't have any vendor assigned.");

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
        work_order_status: {
          create: workOrderStatus,
        },
      },
    };

    this.orderService.setStatus(order.id, dataDto.work_order_status, user);

    const [work_order] = await this.dbService.$transaction([
      this.dbService.work_orders.create(work_order_data),
    ]);

    return work_order;
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { page, take, search, date_from, date_to, status, order_by, tukang_id } =
      queryParamsDto;
      console.log(tukang_id);
      
    const skip = page * take - take;
    const where: Prisma.work_ordersWhereInput = {
      AND: [
        search
          ? {
              OR: [
                { request_work_time: { equals: new Date(search) } },
                { survey_date: { equals: new Date(search) } },
                { work_start_date: { equals: new Date(search) } },
                { work_end_date: { equals: new Date(search) } },
              ],
            }
          : undefined,
        status ? { status: { id: { in: status } } } : undefined,
        tukang_id ? {
          work_order_tukang: {
            some: {
              tukang_id: tukang_id
            }
          }
        } : undefined,
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
            m_order_details: {
              include: {
                item: true,
              },
            },
            store: true,
            sales: true,
            members: true,
            quotation: {
              include: {
                quotation_details: true
              }
            },
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

    return { data: work_orders, skip, page, take, total };
  }

  async findOne(id: number) {
    const work_orders = await this.dbService.work_orders.findFirst({
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
            quotation: {
              include: {
                quotation_details: true
              }
            },
          },
        },
        work_order_tukang: {
          include: {
            tukang: true,
          },
        },
        vendor: true,
        work_order_status: {
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

    return work_orders;
  }

  async update(
    id: number,
    dataDto: UpdateWorkOrderDto,
    user: users,
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    const checkWorkOrder = await this.dbService.work_orders.findFirst({
      where: {
        id,
      },
      include: {
        work_order_status: true,
      },
    });

    if (!checkWorkOrder) throw new BadRequestException('Work Order not exist');

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

    const deletedWorkOrderTukang = dataDto.work_order_tukang ? dataDto?.work_order_tukang
      .filter((x) => Boolean(x.id))
      .map((x) => x.id) : undefined;

    const [syncTukang, syncEvidence, work_order] =
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
                  work_order_id: id
                }
              : undefined),
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        // this.dbService.work_order_items.updateMany({
        //   where: {
        //     id: {
        //       notIn: dataDto?.status_details?.work_order_items
        //         .filter((x) => Boolean(x.id))
        //         .map((x) => x.id),
        //     },
        //   },
        //   data: {
        //     deleted_at: new Date(),
        //     deleted_by: user.id,
        //   },
        // }),
        this.dbService.work_orders.update(work_order_data),
      ]);

    return work_order;
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
        // work_order_tukang: {
        //   include: {
        //     tukang: true,
        //   },
        // },
        vendor: true,
        work_order_status: {
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

    const recentWorkStatus = workOrder.work_order_status.find(
      (x) => x.status_id === NEW_STATUS.id,
    );

    console.log(recentWorkStatus);

    const upsertItems: Prisma.work_order_itemsUpsertWithWhereUniqueWithoutWork_order_statusInput[] =
      updateData.work_order_items ? updateData.work_order_items.map((x) => ({
        where: {
          id: x?.id ?? 0,
          work_order_status_id: recentWorkStatus?.id ?? 0,
        },
        create: {
          item_id: x?.item_id,
          name: x?.item_name,
          tukang_id: x.tukang_id ?? undefined,
          tukang_name: x.tukang_name ?? undefined,
          type: x.type,
          is_customer: Boolean(x.is_customer),
          quantity: x.quantity,
          unit: x?.unit,
        },
        update: {
          item_id: x.item_id,
          name: x.item_name,
          tukang_id: x.tukang_id ?? undefined,
          tukang_name: x.tukang_name ?? undefined,
          type: x.type,
          quantity: x.quantity,
          is_customer: Boolean(x.is_customer),
          unit: x?.unit,
        },
      })) : undefined;

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
          ...(updateData.work_order_items ? {
            work_order_items: {
              createMany: { data: upsertItems.map((x) => x.create) },
            }
          } : undefined) 
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
        ...(updateData.work_order_items ? [
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
        ] : []),
        this.dbService.work_order_status.updateMany({
          where: {
            id: NEW_STATUS?.id ?? 0,
            work_order_id: id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user.id,
          },
        }),
        this.dbService.work_orders.update({
          where: { id },
          data: {
            status_id: NEW_STATUS.id,
            work_order_evidences: { createMany: { data: evidences } },
            ...(updateData.work_order_items ? {
              work_order_status: {
                upsert: workOrderStatusUpsert,
              },
            } : undefined) 
          },
        }),
      ]);
      
      const work_order = await this.dbService.work_orders.findUnique({
        where: { id },
      });
      
      return work_order;
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
}
