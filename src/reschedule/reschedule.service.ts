import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRescheduleDto } from './dto/create-reschedule.dto';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateRescheduleDto } from './dto/update-reschedule.dto';
import { OrderService } from 'src/order/order.service';

@Injectable()
export class RescheduleService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
  ) {}

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
      },
    });

    // const status = await this.dbService.status.findMany({
    //   where: {
    //     id: {
    //       in: [
    //         rescheduleDto.status_id,
    //         rescheduleDto.reschedule_status.status_id,
    //       ],
    //     },
    //   },
    // });

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
            id: rescheduleDto.reschedule_status.status_id,
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
      },
    });
    const countTotal = await this.dbService.reschedule.count();

    return {
      data: reschedule,
      meta: { countTotal, takeTotal: reschedule.length, page, take },
    };
  }

  async findOne(id: number) {
    const reschedule = await this.dbService.reschedule.findFirst({
      where: {
        id,
      },
      include: {
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
      },
    });

    return reschedule;
  }

  async update(
    id: number,
    rescheduleDto: UpdateRescheduleDto,
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
      },
    });

    // const status = await this.dbService.status.findMany({
    //   where: {
    //     id: {
    //       in: [
    //         rescheduleDto.status_id,
    //         rescheduleDto.reschedule_status.status_id,
    //       ],
    //     },
    //   },
    // });

    if (!order) {
      throw new Error('Order not found');
    }

    // if (status.some((status) => status === null)) {
    //   throw new Error('One or More Status not found');
    // }

    if (order.status.category === 'DONE') {
      throw new Error('Order is already done');
    }
    console.log(rescheduleDto);

    const rescheduleStatus: Prisma.reschedule_statusUpsertWithWhereUniqueWithoutRescheduleInput =
      {
        where: {
          id: rescheduleDto.reschedule_status.id,
        },
        create: {
          status: {
            connect: {
              id: rescheduleDto.reschedule_status.status_id,
            },
          },
          description: rescheduleDto.reschedule_status.description,
          status_by: rescheduleDto.reschedule_status.status_by,
          created_by: user_id,
        },
        update: {
          status: {
            connect: {
              id: rescheduleDto.reschedule_status.status_id,
            },
          },
          description: rescheduleDto.reschedule_status.description,
          status_by: rescheduleDto.reschedule_status.status_by,
          updated_by: user_id,
          updated_at: new Date(),
        },
      };

    const rescheduleEvidences: Prisma.reschedule_evidencesCreateManyRescheduleInput[] =
      reschedule_evidences.map((evidence) => {
        return {
          evidence_location: evidence.filename,
          created_by: user_id,
        };
      });

    const rescheduleData: Prisma.rescheduleUpdateArgs = {
      where: {
        id,
      },
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
        created_by: user_id,
        reschedule_status: {
          upsert: {
            ...rescheduleStatus,
          },
        },
        reschedule_evidences: {
          createMany: {
            data: rescheduleEvidences,
          },
        },
      },
    };

    const [syncEvidence, reschedule] = await this.dbService.$transaction([
      this.dbService.reschedule_evidences.updateMany({
        where: {
          reschedule_id: id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      }),
      this.dbService.reschedule.update(rescheduleData),
    ]);

    await this.orderService.setStatus(order.id, rescheduleDto.status_id, user);
    return reschedule;
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
}
