import { Injectable, HttpStatus } from '@nestjs/common';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dbService: PrismaService,
  ) {}
  async create(createItemDto: CreateItemDto, user_id: number) {
    const prices = createItemDto.prices.map((price) => {
      return {
        ...price,
        periodic_start: new Date(price.periodic_start),
        periodic_end: new Date(price.periodic_end),
        created_by: user_id,
      };
    });

    const itemDataOptions: Prisma.itemsCreateInput = {
      item_code: createItemDto?.item_code,
      item_name: createItemDto?.item_name,
      service_name: createItemDto.name,
      default_price: createItemDto.default_price,
      category: {
        connect: {
          id: createItemDto.category_id,
        },
      },
      prices: {
        createMany: {
          data: prices,
        },
      },
    };

    const [{ id: items_id }] = await this.dbService.$transaction([
      this.dbService.items.create({
        data: itemDataOptions,
      }),
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
      ...createItemDto,
    };
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { search, take, page, skip, group_by } = queryParamsDto;
    const category_id = +search ? Number.parseInt(search) : undefined;
    const itemsOptions = {
      skip: skip ?? 0,
      take: take > 0 ? take : undefined,
      where: {
        AND: [
          search
            ? {
                OR: [
                  {
                    service_name: {
                      contains: search,
                    },
                  },
                  category_id
                    ? {
                        category_id: {
                          equals: category_id,
                        },
                      }
                    : undefined,
                ],
              }
            : undefined,
          {
            deleted_at: null,
          },
        ],
      },
      select: {
        item_name: true,
        item_code: true,
        service_name: true,
        category_id: true,
        created_at: true,
        updated_at: true,
        created_by: true,
        updated_by: true,
        prices: true,
      },
    };

    const items = await this.dbService.items.findMany({ ...itemsOptions });

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
    console.log(UpdateDataDto);

    // update or insert
    const priceUpsert: Prisma.pricesUpsertWithWhereUniqueWithoutItemsInput[] =
      UpdateDataDto.prices.map((item) => ({
        where: {
          item_id: id,
          // If id is not present set it to zero to be created
          id: item?.id ?? 0,
        },
        update: {
          store_id: item?.store_id,
          periodic_start: item?.periodic_start
            ? new Date(item.periodic_start)
            : undefined,
          periodic_end: item?.periodic_end
            ? new Date(item.periodic_end)
            : undefined,
          min_order: item?.min_order,
          price: item?.price,
          updated_by: user_id,
          updated_at: new Date(),
        },
        create: {
          store_id: item?.store_id,
          periodic_start: item?.periodic_start
            ? new Date(item.periodic_start)
            : undefined,
          periodic_end: item?.periodic_end
            ? new Date(item.periodic_end)
            : undefined,
          min_order: item?.min_order,
          price: item?.price,
          created_at: new Date(),
          created_by: user_id,
        },
      }));

    const [syncPrices, items_query] = await this.dbService.$transaction([
      this.dbService.prices.deleteMany({
        where: {
          item_id: id,
          id: {
            notIn: UpdateDataDto.prices
              .filter((x) => Boolean(x.id))
              .map((x) => x.id),
          },
        },
      }),
      this.dbService.items.update({
        where: {
          id,
        },
        data: {
          item_code: UpdateDataDto?.item_code,
          item_name: UpdateDataDto?.item_name,
          service_name: UpdateDataDto?.name,
          category_id: UpdateDataDto?.category_id,
          prices: {
            upsert: priceUpsert,
          },
        },
      }),
    ]);

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
