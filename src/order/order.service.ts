import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { orders, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';

@Injectable()
export class OrderService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    file: Express.Multer.File,
  ) {
    const { id } = user;
    let filePath = null;
    if (file) {
      filePath = file.filename;
    }
    const order_details = createOrderDto.order_details.map((item) => {
      return { ...item, created_by: id };
    });
    const ordersOptions = {
      data: {
        members: {
          connect: {
            id: createOrderDto.member_id,
          },
        },
        seles: {
          connect: {
            id: createOrderDto.seles_id,
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
            id: createOrderDto.project_status_id,
          },
        },
        project_address: createOrderDto.project_address,
        receipt_number: createOrderDto.receipt_number,
        receipt_path: filePath,
        total_estimate_workdays: createOrderDto.total_estimate_workdays,
        grand_total: createOrderDto.grand_total,
        grand_total_comission: createOrderDto.grand_total_comission,
        created_by: id,
        payment_type: PAYMENT_TYPE.GRATIS,
        print_counter: 0,
        m_order_details: {
          createMany: {
            data: order_details,
          },
        },
      },
    };
    console.log(ordersOptions);
    const query = this.dbService.$transaction([
      this.dbService.orders.create(ordersOptions),
    ]);
  }

  findAll() {
    return `This action returns all order`;
  }

  findOne(id: number) {
    return `This action returns a #${id} order`;
  }

  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }
}
