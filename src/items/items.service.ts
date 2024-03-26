import { Injectable, HttpStatus } from '@nestjs/common';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Store } from 'src/store/entities/store.entity';

@Injectable()
export class ItemsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dbService: PrismaService,
  ) {}
  async create(createItemDto: CreateItemDto, user_id: number) {
    const {
      item_code,
      item_name,
      name: service_name,
      default_price,
      category_id,
      prices,
    } = createItemDto;

    const createdItem = await this.dbService.items.create({
      data: {
        item_code,
        item_name,
        service_name,
        default_price,
        category: { connect: { id: category_id } },
      },
    });

    const createPricePromises = prices.map(async (price) => {
      const {
        periodic_start,
        periodic_end,
        min_order,
        price: priceValue,
        price_store,
      } = price;

      const createdPrice = await this.dbService.prices.create({
        data: {
          item_id: createdItem.id,
          periodic_start: new Date(periodic_start),
          periodic_end: new Date(periodic_end),
          min_order,
          price: priceValue,
          created_by: user_id,
        },
      });

      await Promise.all(
        price_store.map(async (storeItem) => {
          let storeIds: number[] = [];
          if (storeItem.store_id) {
            storeIds.push(storeItem.store_id);
          } else if (storeItem.store_group_id) {
            const storeGroup = await this.dbService.store_group.findFirst({
              where: {
                id: storeItem.store_group_id,
              },
              include: {
                store: true,
              },
            });
            if (storeGroup) {
              storeIds = storeGroup.store.map((store) => store.id);
            }
          }

          await Promise.all(
            storeIds.map((storeId) =>
              this.dbService.price_stores.create({
                data: {
                  price_id: createdPrice.id,
                  store_id: storeId,
                  created_by: user_id,
                },
              }),
            ),
          );
        }),
      );

      return createdPrice;
    });

    await Promise.all(createPricePromises);

    return {
      id: createdItem.id,
      ...createItemDto,
    };
  }

  async findAll(queryParamsDto: QueryParamsDto, user: users) {
    const { id, role_id } = user;
    const { search, take, page, skip, group_by, all_store, store_id, is_free } = queryParamsDto;
    const category_id = +search ? Number.parseInt(search) : undefined;
    const now = new Date();

    const allStore = await this.dbService.store.findMany().then((data) => data.map((x) => x.id));

    const sales = await this.dbService.users.findFirst({
      where: {
        id,
        role_id,
      },
      include: {
        sales: {
          include: {
            sales_categories: true,
          },
        },
      },
    });

    const itemsOptions: Prisma.itemsFindManyArgs = {
      skip: skip ?? 0,
      take: take > 0 ? take : undefined,
      where: {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      service_name: {
                        contains: search,
                      },
                    },
                  ],
                },
              ]
            : []),
            ...(is_free === 0 ? [{
              prices: {
                every: {
                  price : 0
                }
              }
            }] : []),
          category_id
            ? {
                category_id: {
                  equals: category_id,
                },
              }
            : undefined,
            ...(all_store === 0 ? [{
              prices: {
                every: {
                  price_stores: {
                    every: {
                      store_id: {
                        in: allStore
                      }
                    }
                  }
                }
              }
            }]: []),
          sales.sales
            ? {
                category: {
                  id: {
                    in: sales.sales.sales_categories.map(
                      ({ category_id }) => category_id,
                    ),
                  },
                },
              }
            : undefined,
          {
            deleted_at: null,
          },
        ].filter(Boolean),  
      },
      include: {
        prices: {
          where: {
            periodic_start: { lte: now },
            periodic_end: { gte: now },
          },
          select: {
            id: true,
            item_id: true,
            periodic_start: true,
            periodic_end: true,
            price_stores: {
              select: {
                store: {
                  select: {
                    id: true,
                    store_name: true,
                    city: true, 
                  },
                },
              },
            },
            price: true,
            min_order: true,
            created_at: true,
          },
        },
      },
    };

    const items = await this.dbService.items.findMany({...(itemsOptions)});
    return items;
  }

  async findOne(id: number) {
    const now = new Date();
    const items = await this.dbService.items.findFirst({
      where: {
        id,
      },
      include: {
        category: true,
        prices: {
          where: {
            periodic_start: { lte: now },
            periodic_end: { gte: now },
          },
          select: {
            id: true,
            item_id: true,
            periodic_start: true,
            periodic_end: true,
            price_stores: {
              select: {
                id: true,
                store_id: true,
                store: {
                  select: {
                    store_name: true,
                  },
                },
              },
            },
            price: true,
            min_order: true,
            created_at: true,
          },
        },
      },
    });

    return items;
  }

  async update(id: number, UpdateDataDto: UpdateItemDto, user_id: number) {
    const priceUpsert: Prisma.pricesUpsertWithWhereUniqueWithoutItemsInput[] =
      UpdateDataDto.prices.map((item) => {
        const priceStoreCreate: Prisma.price_storesCreateManyPriceInput[] =
          item.price_store.map((price) => ({
            store_id: price.store_id,
          }));
        const priceStoreUpsert: Prisma.price_storesUpsertWithWhereUniqueWithoutPriceInput[] =
          item.price_store.map((price) => ({
            where: {
              id: price.id ?? 0,
            },
            update: {
              store_id: price.store_id,
            },
            create: {
              store_id: price.store_id,
            },
          }));
        return {
          where: {
            item_id: id,
            // If id is not present set it to zero to be created
            id: item?.id ?? 0,
          },
          update: {
            periodic_start: item?.periodic_start
              ? new Date(item.periodic_start)
              : undefined,
            periodic_end: item?.periodic_end
              ? new Date(item.periodic_end)
              : undefined,
            min_order: item?.min_order,
            price_stores: {
              upsert: priceStoreUpsert,
            },
            price: item?.price,
            updated_by: user_id,
            updated_at: new Date(),
          },
          create: {
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
            price_stores: {
              createMany: {
                data: priceStoreCreate,
              },
            },
          },
        };
      });
    const [syncPrices, items_query] = await this.dbService.$transaction([
      this.dbService.prices.updateMany({
        where: {
          item_id: id,
          id: {
            notIn: UpdateDataDto.prices
              .filter((x) => Boolean(x.id))
              .map((x) => x.id),
          },
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
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
