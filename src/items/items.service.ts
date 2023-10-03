import { Injectable, HttpStatus } from '@nestjs/common';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DataDto } from './dto/create-item.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dbService: PrismaService,
  ) {}
  async create(dataDto: DataDto, user_id: number) {
    const prices = dataDto.prices.map((price) => {
      return {
        ...price,
        periodic_start: new Date(price.periodic_start),
        periodic_end: new Date(price.periodic_end),
        created_by: user_id,
      };
    });

    const item_data = {
      item_name: dataDto.item_name,
      category_name: dataDto.category_name,
    };

    const items: Prisma.itemsCreateArgs = {
      data: {
        ...item_data,
        prices: {
          createMany: {
            data: prices,
          },
        },
      },
    };

    const [{ id: items_id }] = await this.dbService.$transaction([
      this.dbService.items.create(items),
    ]);

    // this.eventEmitter.emit('create.logger', {
    //   module_id: items.id,
    //   module_type: 'items',
    //   issuer_id: user_id,
    //   issuer_type: 'users',
    //   properties: { properties: items, status: 'CREATE' },
    // });
    return {
      id: items_id,
      ...item_data,
    };
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { search, take: limit, page, skip } = queryParamsDto;
    const items = await this.dbService.items.findMany({
      skip: skip ?? 0,
      take: page,
      where: {
        item_name: {
          contains: search,
        },
        category_name: {
          contains: search,
        },
      },
      include: {
        prices: true,
      },
    });

    return items;
  }

  async findOne(id: number) {
    const items = await this.dbService.items.findFirst({
      where: {
        id,
      },
      include: {
        prices: true,
      },
    });
  }

  async update(id: number, UpdateDataDto: UpdateItemDto, user_id: number) {
    const price = UpdateDataDto.prices.map((item) => {
      return {
        where: {
          id: item.id,
        },
        data: {
          // store: {
          //   connect: {
          //     id: item.store_id,
          //   },
          // },
          // units: {
          //   connect: {
          //     id: item.unit_id,
          //   },
          // },
          store_id: item.store_id,
          unit_id: item.unit_id,
          periodic_start: new Date(item.periodic_start),
          periodic_end: new Date(item.periodic_end),
          nominal_discount: item.nominal_discount,
          price: item.price,
          updated_by: user_id,
          updated_at: new Date(),
        },
      };
    });

    const item_data = {
      item_name: UpdateDataDto.item_name,
      category_name: UpdateDataDto.category_name,
    };

    const [items_query] = await this.dbService.$transaction([
      this.dbService.items.update({
        where: {
          id,
        },
        data: {
          ...item_data,
          prices: {
            update: price,
          },
        },
      }),
    ]);

    console.log(items_query);

    return items_query;
  }

  async remove(id: number, user_id: number) {
    const prices = await this.dbService.prices.updateMany({
      where: {
        item_id: id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });
    const items = await this.dbService.items.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });

    return {
      prices,
      items,
    };
  }
}
