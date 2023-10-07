import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';
import { QueryParamsDto } from './dto/query-params.dto';

@Injectable()
export class OrderService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    file: Express.Multer.File,
  ) {
    const filePath = file ? file.filename : '';
    const { id: user_id } = user;
    let grand_total = 0;
    let grand_total_comission = 0;

    const order_details = createOrderDto.order_details.map((item) => {
      const total = item.unit_price * item.quantity + item.quote_price;
      grand_total += total;
      grand_total_comission += item.comission;

      return { ...item, created_by: user_id, order_status_id: 1, total };
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
            id: 1,
          },
        },
        categories: {
          connect: {
            id: 1,
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
      receipt_number: createOrderDto?.receipt_number,
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

    console.log(orderConnection, orderData, ordersOptions);

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
    const { take, page, search, status, date_from, date_to } = queryParams;
    const skip = page * take - take;

    // const where: Prisma.ordersWhereInput = {
    //   OR: [
    //     search ? { receipt_number: { contains: search } } : null,
    //     search ? { members: { full_name: { contains: search } } } : null,
    //     status ? { status: { category: { contains: status } } } : null,
    //   ].filter((condition) => condition !== null),
    //   AND: [
    //     date_from && date_to
    //       ? {
    //           created_at: {
    //             gte: new Date(date_from),
    //             lte: new Date(date_to),
    //           },
    //         }
    //       : null,
    //   ].filter((condition) => condition !== null),
    // };

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
        ...(status ? [{ status: { category: { contains: status } } }] : []),
        ...(date_from && date_to
          ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(date_to),
                },
              },
            ]
          : []),
      ].filter(Boolean),
    };

    console.log(where);

    const orders = await this.dbService.orders.findMany({
      skip,
      take,
      where,
      include: {
        members: true,
        sales: true,
        status: true,
        vendor: true,
        store: true,
        categories: true,
        tukang: true,
      },
    });

    return orders;
  }

  async findOne(id: number) {
    const orders = await this.dbService.orders.findFirst({
      where: {
        id,
      },
      include: {
        members: true,
        sales: true,
        status: true,
        vendor: true,
        store: true,
        categories: true,
        tukang: true,
        m_order_details: {
          select: {
            id: true,
            order_id: true,
            item_id: true,
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
        work_orders: true,
      },
    });

    const data = {
      ...orders,
    };

    data['order_details'] = data.m_order_details;
    delete data.m_order_details;

    return data;
  }

  async update(id: number, updateOrderDto: UpdateOrderDto, user: users) {
    const { id: user_id } = user;
    const orderDetailsUpdateData = updateOrderDto.order_details.map((item) => {
      return {
        where: {
          id: item.id,
        },
        data: {
          item_id: item.item_id,
          order_status_id: item.order_status_id,
          unit: item.unit,
          unit_price: item.unit_price,
          quote_price: item.quote_price,
          quantity: item.quantity,
          total: item.total,
          survey_price: item.survey_price,
          comission: item.comission,
          updated_by: user_id,
          updated_at: new Date(),
        },
      };
    });
    const orderUpdateData = {
      project_address: updateOrderDto.project_address,
      receipt_number: updateOrderDto.receipt_number,
      total_estimate_workdays: updateOrderDto.total_estimate_workdays,
      grand_total: updateOrderDto.grand_total,
      grand_total_comission: updateOrderDto.grand_total_comission,
      updated_by: user_id,
      payment_type: PAYMENT_TYPE.GRATIS,
      print_counter: 0,
    };

    const [orderQuery] = await this.dbService.$transaction([
      this.dbService.orders.update({
        where: {
          id,
        },
        data: {
          ...orderUpdateData,
          m_order_details: {
            update: orderDetailsUpdateData,
          },
        },
      }),
    ]);
    return orderQuery;
  }

  async remove(id: number) {
    return `This action removes a #${id} order`;
  }
}
