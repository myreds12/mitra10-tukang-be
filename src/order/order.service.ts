import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';
import { QueryParamsDto } from './dto/query-params.dto';
import { StatusService } from 'src/status/status.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Item } from 'src/items/entities/item.entity';

@Injectable()
export class OrderService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly statusService: StatusService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    order_files: Array<Express.Multer.File>,
  ) {
    const { id: user_id, role_id } = user;
    const ROLES = await this.dbService.roles.findMany();

    const SALES_ROLES = ROLES.find(({ name }) =>
      name.toLowerCase().includes('sales'),
    );
    const STORE_ROLES = ROLES.find(({ name }) =>
      name.toLowerCase().includes('store staff'),
    );

    const salesUser = await this.dbService.users.findFirst({
      where: { id: user_id },
      include: {
        sales: {
          ...(role_id !== SALES_ROLES?.id
            ? { where: { id: createOrderDto.sales_id } }
            : undefined),
          include: { sales_categories: true },
        },
      },
    });

    const orderDetailItems = await this.dbService.items.findMany({
      where: {
        id: { in: createOrderDto.order_details.map(({ item_id }) => item_id) },
      },
      include: {
        category: true,
        prices: {
          where: {
            periodic_start: { lte: new Date() },
            periodic_end: { gte: new Date() },
          },
        },
      },
    });

    let grand_total = 0;
    let grand_total_comission = 0;
    let project_number = (await this.dbService.orders.count()) + 1;

    const files: Array<Prisma.order_filesCreateManyOrderInput> =
      order_files.map((item) => ({
        type: 'any',
        path: item.filename,
        created_by: user_id,
      }));

    const ROLE_STATUS = await this.dbService.status.findFirst({
      where: {
        category: { equals: role_id === STORE_ROLES.id ? 'picklist' : 'book' },
      },
    });

    if (createOrderDto.payment_type === PAYMENT_TYPE.SURVEY) {
      grand_total += 99000;
    }

    const order_details: Prisma.m_order_detailsCreateManyOrderInput[] =
      createOrderDto.order_details.map((item) => {
        let total = 0;
        const currentItem = orderDetailItems?.find(
          ({ id }) => id === item?.item_id,
        );
        const itemPrice =
          currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
            ?.price ?? currentItem.default_price;
        const comission = Number(
          salesUser?.sales?.sales_categories?.find(
            ({ category_id }) => currentItem.category_id === category_id,
          )?.commission ?? 0,
        );

        if (
          [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY, PAYMENT_TYPE.SURVEY].includes(
            createOrderDto.payment_type,
          )
        ) {
          total = Number(itemPrice) * item.quantity;
          grand_total += total;
          grand_total_comission += comission;
        }

        return {
          ...item,
          unit_price: itemPrice,
          created_by: user_id,
          total,
          comission,
          sales_id: salesUser?.sales?.id ?? createOrderDto.sales_id,
        };
      });

    const orderConnection = Object.fromEntries(
      Object.entries({
        members: { connect: { id: createOrderDto.member_id } },
        store: { connect: { id: createOrderDto.store_id } },
        status: { connect: { id: ROLE_STATUS.id } },
        sales: { connect: { id: createOrderDto.sales_id } },
        vendor: createOrderDto.vendor_id
          ? { connect: { id: createOrderDto.vendor_id } }
          : undefined,
      }).filter(([key, value]) => value !== undefined),
    );

    const orderData = {
      project_address: createOrderDto.project_address,
      project_number: project_number.toString(),
      receipt_number: createOrderDto.receipt_number,
      grand_total: grand_total.toFixed(2),
      grand_total_comission: grand_total_comission.toFixed(2),
      created_by: user_id,
      payment_type: createOrderDto.payment_type,
      print_counter: 0,
      request_survey: new Date(createOrderDto.request_survey),
    };

    const ordersOptions: Prisma.ordersCreateArgs = {
      data: {
        ...orderConnection,
        ...orderData,
        m_order_details: { createMany: { data: order_details } },
        order_files: { createMany: { data: files } },
      },
    };

    const [{ id: order_id }] = await this.dbService.$transaction([
      this.dbService.orders.create(ordersOptions),
    ]);

    await this.addHistory(order_id, createOrderDto);

    return {
      id: order_id,
      ...orderData,
    };
  }

  async findAll(queryParams: QueryParamsDto) {
    // DO SEARCH AND PAGINATION LOGIC ...
    const { take, page, search, status, date_from, date_to, order_by } =
      queryParams;
    const skip = page * take - take;
    console.log(status);

    const where: Prisma.ordersWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  { members: { full_name: { contains: search } } },
                ],
              },
            ]
          : []),
        ...(status ? [{ status: { id: { in: status } } }] : []),
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

    const orders = await this.dbService.orders.findMany({
      skip,
      take: take > 0 ? take : undefined,
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        members: {
          select: {
            id: true,
            city_id: true,
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
            city_id: true,
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
          select: {
            id: true,
            user_id: true,
            company_name: true,
            address: true,
            phone_number: true,
            ktp_number: true,
            npwp_number: true,
            email_address: true,
            join_date: true,
            is_active: true,
            created_at: true,
            updated_at: true,
            created_by: true,
            updated_by: true,
          },
        },
        m_order_details: {
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
        work_orders: {
          include: {
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
        order_files: true,
      },
    });

    return { data: orders, total: orders.length, page, take };
  }

  async findOne(id: number) {
    const orders = await this.dbService.orders.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        members: true,
        sales: true,
        status: true,
        vendor: true,
        store: true,
        m_order_details: {
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
        order_files: true,
        complaints: true,
        work_orders: {
          include: {
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
      },
    });

    const data = {
      ...orders,
    };

    data['order_details'] = data.m_order_details;
    delete data.m_order_details;

    return data;
  }

  async update(
    id: number,
    updateOrderDto: UpdateOrderDto,
    user?: users,
    order_files?: Express.Multer.File[],
  ) {
    const { id: user_id, role_id } = user;
    const currentUser = await this.dbService.users.findFirst({
      where: {
        id: user_id,
      },
      include: {
        roles: true,
        sales: true,
      },
    });
    const files: Array<Prisma.order_filesCreateManyOrderInput> =
      order_files.map((item) => ({
        type: 'any',
        path: item.filename,
        created_by: user_id,
      }));

    const order = await this.findOne(id);

    if (!order) throw new NotFoundException('Order not found');

    const providedDetailIds = updateOrderDto.order_details
      .filter((x) => Boolean(x.id))
      .map((x) => x.id);

    const orderDetail = await this.dbService.m_order_details.findMany({
      where: {
        id: {
          in: providedDetailIds,
        },
      },
      include: {
        item: {
          include: {
            category: true,
            prices: {
              where: {
                periodic_start: { lte: new Date() },
                periodic_end: { gte: new Date() },
              },
            },
          },
        },
      },
    });

    const checkOrderDetailIds = providedDetailIds.filter(
      (x) => !orderDetail.some((y) => x === y.id),
    );

    if (checkOrderDetailIds.length)
      throw new NotFoundException({
        messages: 'The provided detail id not found',
        errorIds: checkOrderDetailIds,
      });

    const searchStatusInput = updateOrderDto.project_status_id
      ? await this.dbService.status.findFirst({
          where: {
            id: updateOrderDto.project_status_id,
          },
        })
      : null;

    let projectStatusDefault = order.status;

    if (
      searchStatusInput &&
      searchStatusInput.category === 'BOOKED' &&
      order.status.category === 'PICKLIST' &&
      currentUser.roles.name.toLowerCase().includes('cs')
    ) {
      projectStatusDefault = searchStatusInput;
    }
    if (
      searchStatusInput &&
      searchStatusInput.category === 'BOOKED' &&
      order.status.category === 'BOOK' &&
      currentUser.roles.name.toLowerCase().includes('admin ho')
    ) {
      projectStatusDefault = searchStatusInput;
    }

    if (
      searchStatusInput &&
      searchStatusInput.category === 'SURVEYREQ' &&
      order.status.category === 'BOOKED' &&
      updateOrderDto.vendor_id
    ) {
      projectStatusDefault = searchStatusInput;
    }

    if (
      searchStatusInput &&
      searchStatusInput.category === 'SURVEYSTART' &&
      order.status.category === 'SURVEYREQ'
    ) {
      projectStatusDefault = searchStatusInput;
    }

    const salesUser = await this.dbService.sales.findFirst({
      where: {
        id: order.sales_id,
      },
      include: {
        sales_categories: true,
      },
    });

    const orderDetailItems = orderDetail.map((x) => x.item);

    let grand_total = 0;
    let grand_total_comission = 0;

    const orderDetailUpsert: Prisma.m_order_detailsUpsertWithWhereUniqueWithoutOrderInput[] =
      updateOrderDto.order_details.map((item) => {
        let total = 0;
        const currentItem = orderDetailItems?.find(
          ({ id }) => id === item?.item_id,
        );

        const itemPrice = (
          currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
            ?.price ?? currentItem.default_price
        ).toString();

        const comission = Number(
          salesUser?.sales_categories?.find(
            ({ category_id }) => currentItem.category_id === category_id,
          )?.commission ?? 0,
        );

        if (
          [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY, PAYMENT_TYPE.SURVEY].includes(
            updateOrderDto.payment_type,
          )
        ) {
          total = Number(itemPrice) * item.quantity;
          grand_total += total;
          grand_total_comission += comission;
        }

        return {
          where: { id: item?.id ?? 0, order_id: id },
          update: {
            item_name: item?.item_name ?? '',
            item_code: item?.item_code ?? '',
            item_id: item?.item_id ?? undefined,
            quantity: item?.quantity,
            unit_price: itemPrice,
            total,
            comission,
            updated_by: user_id,
            updated_at: new Date(),
          },
          create: {
            item: { connect: { id: item?.item_id ?? undefined } },
            sales: {
              connect: { id: updateOrderDto.sales_id ?? order.sales_id },
            },
            item_name: item?.item_name ?? '',
            item_code: item?.item_code ?? '',
            quantity: item?.quantity,
            unit_price: itemPrice,
            total,
            comission,
            created_by: user_id,
            created_at: new Date(),
          },
        };
      });

    const orderUpdateData: Prisma.ordersUncheckedUpdateInput = {
      member_id: updateOrderDto?.member_id,
      store_id: updateOrderDto?.store_id,
      vendor_id: updateOrderDto?.vendor_id,
      project_address: updateOrderDto?.project_address,
      receipt_number: updateOrderDto?.receipt_number,
      grand_total: grand_total,
      grand_total_comission: grand_total_comission,
      updated_by: user_id,
      payment_type: updateOrderDto?.payment_type,
      project_status_id: projectStatusDefault.id,
      print_counter: 0,
      updated_at: new Date(),
      request_survey: updateOrderDto?.request_survey
        ? new Date(updateOrderDto?.request_survey)
        : undefined,
      order_files: {
        createMany: {
          data: files,
        },
      },
    };

    const [syncDetails, syncFiles, orderQuery] =
      await this.dbService.$transaction([
        this.dbService.m_order_details.updateMany({
          where: {
            order_id: id,
            id: {
              notIn: updateOrderDto.order_details
                .filter((x) => Boolean(x?.id))
                .map((item) => {
                  return item.id;
                }),
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.order_files.updateMany({
          where: {
            order_id: id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.orders.update({
          where: {
            id: order.id,
          },
          data: {
            ...orderUpdateData,
            m_order_details: {
              upsert: orderDetailUpsert,
            },
          },
        }),
      ]);
    return orderQuery;
  }

  async remove(id: number) {
    return `This action removes a #${id} order`;
  }

  async counter(id: number) {
    const order = await this.dbService.orders.findFirst({
      where: {
        id,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    this.dbService.$transaction([
      this.dbService.orders.update({
        where: {
          id,
        },
        data: {
          print_counter: order.print_counter + 1,
        },
      }),
    ]);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkStatus() {
    const status = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'BOOK',
        },
      },
    });
    const statusUnpaid = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'UNPAID',
        },
      },
    });
    const date = new Date();
    const thirdDateTime = new Date(date.setDate(date.getDate() - 3));
    const orders = await this.dbService.orders.updateMany({
      where: {
        status: {
          id: status.id,
        },
        created_at: {
          lt: thirdDateTime,
        },
      },
      data: {
        project_status_id: statusUnpaid.id,
      },
    });
    console.log(orders, thirdDateTime);

    return orders;
  }

  async setStatus(id: number, status_id: number) {
    const order = await this.findOne(id);

    if (!order) throw new BadRequestException('Order does not Exist!');
    const [STATUS] = await this.dbService.status.findMany({
      where: {
        id: status_id,
      },
      orderBy: {
        category: 'desc',
      },
    });
    const orderData: Prisma.ordersUpdateInput = {
      status: {
        connect: {
          id: STATUS.id,
        },
      },
    };

    const [orders] = await this.dbService.$transaction([
      this.dbService.orders.update({
        where: {
          id,
        },
        data: orderData,
      }),
    ]);

    return orders;
  }

  async addHistory(id: number, payload: Object): Promise<void> {
    // TODO: THE ORDER HISTORY FUNCTION
    // TODO: SAVE THE PAYLOAD TO THE HISTORY TABLE ...
    // JSON.stringify(payload)
  }
}
