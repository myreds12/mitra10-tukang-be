import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';
import { QueryParamsDto } from './dto/query-params.dto';

@Injectable()
export class OrderService {
  constructor(private readonly dbService: PrismaService) { }
  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    file: Express.Multer.File,
  ) {
    // TO DO: ERROR LINE 105
    const { id: user_id } = user;
    let filePath = null;
    if (file) {
      filePath = file.filename;
    }
    const order_details = createOrderDto.order_details.map((item) => {
      return { ...item, created_by: user_id };
    });

    const orderConnection = {
      members: {
        connect: {
          id: createOrderDto.member_id,
        },
      },
      categories: {
        connect: {
          id: createOrderDto.category_id,
        },
      },
      store: {
        connect: {
          id: createOrderDto.store_id,
        },
      },
      sales: {
        connect: {
          id: createOrderDto.sales_id,
        },
      },
      vendor: {
        connect: {
          id: createOrderDto.vendor_id,
        },
      },
      tukang: {
        connect: {
          id: createOrderDto.tukang_id,
        },
      },
      status: {
        connect: {
          id: createOrderDto.project_status_id ?? 3,
        },
      },
    };
    const orderData = {
      project_address: createOrderDto.project_address,
      receipt_number: createOrderDto.receipt_number,
      receipt_path: filePath ?? '',
      total_estimate_workdays: createOrderDto.total_estimate_workdays,
      grand_total: createOrderDto.grand_total.toFixed(2),
      grand_total_comission: createOrderDto.grand_total_comission.toFixed(2),
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
    const { limit, page, skip, search, status } = queryParams;
    const orders = await this.dbService.orders.findMany({
      skip: skip ?? 0,
      take: limit,
      where: {
        OR: [
          {
            receipt_number: {
              contains: search,
            },
          },
          {
            members: {
              full_name: {
                contains: search,
              },
            },
          },
          {
            status: {
              category: {
                contains: status,
              },
            },
          },
        ],
      },
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
      },
    });

    return orders;
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
