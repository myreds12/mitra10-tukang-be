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

@Injectable()
export class OrderService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly statusService: StatusService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    file: Express.Multer.File,
  ) {
    const filePath = file ? file.filename : '';
    const { id: user_id } = user;
    let grand_total = 0;
    let grand_total_comission = 0;

    const BOOKED_STATUS = await this.dbService.status.findFirst({
      where: {
        category: {
          equals: 'book',
        },
      },
    });

    if (createOrderDto.payment_type === PAYMENT_TYPE.SURVEY) {
      grand_total += 99000;
    }

    const order_details = createOrderDto.order_details.map((item) => {
      let total = 0;

      if (
        [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY, PAYMENT_TYPE.SURVEY].includes(
          createOrderDto.payment_type,
        )
      ) {
        total = item.unit_price * item.quantity + item.quote_price;
        grand_total += total;
        grand_total_comission += item.comission;
      }

      return {
        ...item,
        created_by: user_id,
        order_status_id: BOOKED_STATUS.id,
        total,
      };
    });

    const orderConnection = Object.fromEntries(
      Object.entries({
        members: {
          connect: {
            id: createOrderDto.member_id,
          },
        },
        store: {
          connect: {
            id: createOrderDto.store_id,
          },
        },
        status: {
          connect: {
            id: BOOKED_STATUS.id,
          },
        },
        sales: {
          connect: {
            id: createOrderDto.sales_id,
          },
        },
        vendor: createOrderDto.vendor_id
          ? {
              connect: {
                id: createOrderDto.vendor_id,
              },
            }
          : undefined,
        tukang: createOrderDto.tukang_id
          ? {
              connect: {
                id: createOrderDto.tukang_id,
              },
            }
          : undefined,
      }).filter(([key, value]) => value !== undefined),
    );

    const orderData = {
      project_address: createOrderDto.project_address,
      project_number: createOrderDto.project_number,
      receipt_number: createOrderDto.receipt_number,
      receipt_path: filePath ?? '',
      total_estimate_workdays: createOrderDto.total_estimate_workdays,
      grand_total: grand_total.toFixed(2),
      grand_total_comission: grand_total_comission.toFixed(2),
      created_by: user_id,
      payment_type: createOrderDto.payment_type,
      print_counter: 0,
    };
    const ordersOptions: Prisma.ordersCreateArgs = {
      data: {
        ...orderConnection,
        ...orderData,
        m_order_details: {
          createMany: {
            data: order_details,
          },
        },
      },
    };

    const [{ id: order_id }] = await this.dbService.$transaction([
      this.dbService.orders.create(ordersOptions),
    ]);

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
    const countTotal = await this.dbService.orders.count();
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

    console.log(where);

    const orders = await this.dbService.orders.findMany({
      skip,
      take: take > 0 ? take : undefined,
      where,
      orderBy: {
        created_at: order_by,
      },
      select: {
        id: true,
        member_id: true,
        members: true,
        seles_id: true,
        sales: true,
        store_id: true,
        store: true,
        project_status_id: true,
        status: true,
        vendor_id: true,
        vendor: true,
        tukang_id: true,
        tukang: true,
        // category_id: true,
        // categories: true,
        project_address: true,
        receipt_number: true,
        receipt_path: true,
        total_estimate_workdays: true,
        payment_type: true,
        grand_total: true,
        grand_total_comission: true,
        print_counter: true,
        created_by: true,
        updated_by: true,
        created_at: true,
        updated_at: true,
        m_order_details: {
          select: {
            id: true,
            order_id: true,
            item_id: true,
            item: {
              select: {
                id: true,
                item_name: true,
                category_name: true,
              },
            },
            order_status_id: true,
            status: {
              select: {
                category: true,
                description: true,
              },
            },
            unit: true,
            unit_price: true,
            quote_price: true,
            quantity: true,
            total: true,
            survey_price: true,
            comission: true,
            created_by: true,
            updated_by: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });

    return { data: orders, countTotal, page, take };
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
        // categories: true,
        tukang: true,
        m_order_details: {
          select: {
            id: true,
            order_id: true,
            item_id: true,
            item: {
              select: {
                id: true,
                category_name: true,
                prices: true,
              },
            },
            order_status_id: true,
            unit: true,
            unit_price: true,
            quote_price: true,
            quantity: true,
            total: true,
            survey_price: true,
            comission: true,
            created_by: true,
            updated_by: true,
            created_at: true,
            updated_at: true,
            status: {
              select: {
                category: true,
                description: true,
              },
            },
          },
        },
        complaints: true,
        // TODO: TAMBAHIN ORDERBY DESC KETIKA INCLUDE WORK_ORDER_STATUS
        work_orders: {
          include: {
            work_order_status: {
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
    file?: Express.Multer.File,
  ) {
    const { id: user_id, role_id } = user;
    const filePath = file ? file.filename : undefined;
    const order = await this.dbService.orders.findFirst({
      where: {
        id,
      },
      include: {
        status: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

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
      order.status.category === 'BOOK'
    ) {
      projectStatusDefault = searchStatusInput;
    }

    if (
      searchStatusInput &&
      searchStatusInput.category === 'SURVEYREQ' &&
      order.status.category === 'BOOKED'
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

    console.log(projectStatusDefault, updateOrderDto.order_details);

    const orderDetailsUpdateData = updateOrderDto.order_details
      .filter((x) => Boolean(x.id))
      .map((item) => ({
        where: {
          id: item.id,
        },
        data: {
          item_id: item?.item_id,
          order_status_id: projectStatusDefault.id,
          unit: item?.unit,
          unit_price: item?.unit_price,
          quote_price: item?.quote_price,
          quantity: item?.quantity,
          total: item?.total,
          survey_price: item?.survey_price,
          comission: item?.comission,
          updated_by: user_id,
          updated_at: new Date(),
        },
      }));

    const orderDetailsNew = {
      data: updateOrderDto.order_details
        .filter((x) => !Boolean(x.id))
        .map((item) => ({
          item_id: item?.item_id,
          order_status_id: projectStatusDefault.id,
          unit: item?.unit,
          unit_price: item?.unit_price,
          quote_price: item?.quote_price,
          quantity: item?.quantity,
          total: item?.total,
          survey_price: item?.survey_price,
          comission: item?.comission,
          created_by: user_id,
          updated_by: user_id,
          updated_at: new Date(),
        })),
    };

    const orderUpdateData: Prisma.ordersUncheckedUpdateInput = {
      member_id: updateOrderDto?.member_id,
      seles_id: updateOrderDto?.seles_id,
      store_id: updateOrderDto?.store_id,
      vendor_id: updateOrderDto?.vendor_id,
      project_address: updateOrderDto?.project_address,
      receipt_number: updateOrderDto?.receipt_number,
      receipt_path: filePath,
      total_estimate_workdays: updateOrderDto?.total_estimate_workdays,
      grand_total: updateOrderDto?.grand_total,
      grand_total_comission: updateOrderDto?.grand_total_comission,
      updated_by: user_id,
      payment_type: updateOrderDto?.payment_type,
      project_status_id: projectStatusDefault.id,
      print_counter: 0,
      updated_at: new Date(),
    };
    console.log(orderDetailsUpdateData, orderDetailsNew, orderUpdateData);

    const [syncDetails, orderQuery] = await this.dbService.$transaction([
      this.dbService.m_order_details.deleteMany({
        where: {
          order_id: id,
          id: {
            notIn: updateOrderDto.order_details.map((item) => {
              return item.id;
            }),
          },
        },
      }),
      this.dbService.orders.update({
        where: {
          id: order.id,
        },
        data: {
          ...orderUpdateData,
          m_order_details: {
            update: orderDetailsUpdateData.length
              ? orderDetailsUpdateData
              : undefined,
            createMany: orderDetailsNew.data.length
              ? orderDetailsNew
              : undefined,
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
}
