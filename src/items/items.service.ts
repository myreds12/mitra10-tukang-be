import { Injectable, HttpStatus } from '@nestjs/common';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, store, store_group, users } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Store } from 'src/store/entities/store.entity';

@Injectable()
export class ItemsService {
  constructor(private readonly dbService: PrismaService) {}
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

    const pricesData = prices.map(async (prc) => {
      const { periodic_start, periodic_end, min_order, price, price_store } =
        prc;

      const createdPrice = await this.dbService.prices.create({
        data: {
          item_id: createdItem.id,
          periodic_start: new Date(periodic_start),
          periodic_end: new Date(periodic_end),
          min_order,
          price: price,
          created_by: user_id,
        },
      });

      // Check if all_store is 1, then select all stores
      if (price_store.every((storeItem) => storeItem.all_store === 1)) {
        const allStores = await this.dbService.store.findMany();
        const storeIds = allStores.map((store) => store.id);
        await Promise.all(
          storeIds.map(
            async (storeId) =>
              await this.dbService.price_stores.create({
                data: {
                  price_id: createdPrice.id,
                  store_id: storeId,
                  created_by: user_id,
                },
              }),
          ),
        );
      } else {
        // Iterate through price_store and handle each item accordingly
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
      }

      return createdPrice;
    });

    await Promise.all(pricesData);

    return {
      id: createdItem.id,
      ...createItemDto,
    };
  }

  async findAll(queryParamsDto: QueryParamsDto, user: users) {
    const { id, role_id } = user;
    const { search, take, page, group_by, all_store, store_id, is_free } =
      queryParamsDto;
    const category_id = +search ? Number.parseInt(search) : undefined;
    const now = new Date();

    const allStore = await this.dbService.store
      .findMany()
      .then((data) => data.map((x) => x.id));

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
    const skip = page * take - take;

    const where: Prisma.itemsWhereInput = {
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
        ...(is_free === 1
          ? [
              {
                prices: {
                  every: {
                    price: 0,
                  },
                },
              },
            ]
          : []),
        category_id
          ? {
              category_id: {
                equals: category_id,
              },
            }
          : undefined,
        ...(all_store === 1
          ? [
              {
                prices: {
                  every: {
                    price_stores: {
                      every: {
                        store_id: {
                          in: allStore,
                        },
                      },
                    },
                  },
                },
              },
            ]
          : []),
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
    };

    const itemsOptions: Prisma.itemsFindManyArgs = {
      skip,
      take: take > 0 ? take : undefined,
      where,
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
                    area: true,
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
    const total = await this.dbService.items.count({
      where,
    });

    const items = await this.dbService.items.findMany({ ...itemsOptions });
    return {
      data: items,
      page,
      take,
      total,
    };
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
            deleted_at: null,
          },
          select: {
            id: true,
            item_id: true,
            periodic_start: true,
            periodic_end: true,
            price_stores: {
              where: {
                deleted_at: null,
              },
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
    const allStores = await this.dbService.store.findMany({
      select: {
        id: true,
        store_name: true,
      },
    });
    // define it as and integer that have an array of objects
    const storeGroups = new Map<number, Array<store>>();
    const pricesStoreIds = [];

    const priceUpsert: Prisma.pricesUpsertWithWhereUniqueWithoutItemsInput[] =
      await Promise.all(
        UpdateDataDto.prices.map(async (price) => {
          const priceStoreCreate: Prisma.price_storesCreateManyPriceInput[] =
            [];
          const priceStoreUpsert: Prisma.price_storesUpsertWithWhereUniqueWithoutPriceInput[] =
            [];

          for (const value of price.price_store) {
            console.log(value.all_store);
            if (value.all_store) {
              priceStoreCreate.push(
                ...allStores.map(({ id }) => ({ store_id: id })),
              );
            } else if (value.store_group_id) {
              if (!storeGroups.has(value.store_group_id)) {
                const storeGroup = await this.dbService.store_group.findFirst({
                  where: {
                    id: value.store_group_id,
                  },
                  include: {
                    store: true,
                  },
                });
                storeGroups.set(value.store_group_id, storeGroup.store);
              }
              const storeGroup = storeGroups.get(value.store_group_id);
              priceStoreCreate.push(
                ...storeGroup?.map(({ id }) => ({ store_id: id })),
              );
            } else {
              priceStoreUpsert.push({
                where: { id: value.id },
                update: { store_id: value.store_id },
                create: { store_id: value.store_id },
              });
            }
          }

          return {
            where: { item_id: id, id: price?.id },
            update: {
              periodic_start: price?.periodic_start
                ? new Date(price.periodic_start)
                : undefined,
              periodic_end: price?.periodic_end
                ? new Date(price.periodic_end)
                : undefined,
              min_order: price?.min_order,
              price: price.price,
              price_stores: {
                upsert: priceStoreUpsert,
              },
              updated_by: user_id,
              updated_at: new Date(),
            },
            create: {
              periodic_start: price?.periodic_start
                ? new Date(price.periodic_start)
                : undefined,
              periodic_end: price?.periodic_end
                ? new Date(price.periodic_end)
                : undefined,
              min_order: price?.min_order,
              price: price.price,
              created_at: new Date(),
              created_by: user_id,
              price_stores: {
                createMany: {
                  data: priceStoreCreate.map((x) => ({
                    ...x,
                    created_by: user_id,
                  })),
                },
              },
            },
          };
        }),
      );

    const itemQuery = {
      where: { id },
      data: {
        item_code: UpdateDataDto?.item_code,
        item_name: UpdateDataDto?.item_name,
        service_name: UpdateDataDto?.name,
        category_id: UpdateDataDto?.category_id,
        default_price: UpdateDataDto?.default_price,
        prices: { upsert: priceUpsert },
      },
    };

    console.log(itemQuery);
    console.log(priceUpsert);

    const [syncPrices, updateItem] = await this.dbService.$transaction([
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
      this.dbService.items.update(itemQuery),
    ]);

    return updateItem;
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
