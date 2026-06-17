/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, store } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
@Injectable()
export class ItemsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createItemDto: CreateItemDto, user_id: number) {
    try {
      const {
        item_code,
        item_name,
        name: service_name,
        default_price,
        category_id,
        prices,
        item_type,
        invoice_nominal,
      } = createItemDto;

      // Validasi: invoice_nominal tidak boleh melebihi default_price
      if (invoice_nominal && default_price && Number(invoice_nominal) > Number(default_price)) {
        throw new BadRequestException(
          `invoice_nominal (${invoice_nominal}) tidak boleh melebihi default_price (${default_price})`,
        );
      }

      const createdItem = await this.dbService.items.create({
        data: {
          item_code,
          item_name,
          service_name,
          default_price,
          type: item_type,
          invoice_nominal,
          category: { connect: { id: category_id } },
        },
      });

      const pricesData = prices.length > 0 ? prices.map(async (prc) => {
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
      }) : [undefined];

      await Promise.all(pricesData);

      return {
        id: createdItem.id,
        ...createItemDto,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const {
        search,
        take,
        page,
        all_store,
        store_id,
        is_free,
        item_type,
        is_promotion,
      } = queryParamsDto;
      // const category_id = +search ? Number.parseInt(search) : undefined;

      const allStore = await this.dbService.store
        .findMany()
        .then((data) => data.map((x) => x.id));

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
                  {
                    item_name: {
                      contains: search,
                    },
                  },
                  {
                    item_code: {
                      contains: search,
                    },
                  },
                ],
              },
            ]
            : []),
          ...(is_promotion === 1
            ? [
              {
                prices: {
                  some: {
                    deleted_at: null,
                    periodic_start: {
                      lte: new Date(),
                    },
                    periodic_end: {
                      gte: new Date(),
                    }
                  },
                },
              },
            ]
            : []),
          ...(store_id
            ? [
              {
                prices: {
                  some: {
                    deleted_at: null,
                    is_active: true,
                    price_stores: {
                      some: {
                        deleted_at: null,
                        store_id: {
                          in: store_id,
                        },
                      },
                    },
                  },
                },
              },
            ]
            : []),
          ...(item_type ? [{ type: { in: item_type } }] : []),
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
          // category_id
          //   ? {
          //       category_id: {
          //         equals: category_id,
          //       },
          //     }
          //   : undefined,
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
          // sales.sales
          //   ? {
          //       category: {
          //         id: {
          //           in: sales.sales.sales_categories.map(
          //             ({ category_id }) => category_id,
          //           ),
          //         },
          //       },
          //     }
          //   : undefined,
          // {
          //   deleted_at: null,
          // },
        ].filter(Boolean),
        deleted_at: null,
        deleted_by: null,
      };

      // console.log('Generated WHERE clause:', JSON.stringify(where, null, 2));

      const itemsOptions: Prisma.itemsFindManyArgs = {
        skip,
        take: take > 0 ? take : undefined,
        where,
        include: {
          category: true,
          prices: {
            where: {
              deleted_by: null,
              deleted_at: null,
            },
            select: {
              id: true,
              item_id: true,
              periodic_start: true,
              periodic_end: true,
              is_active: true,

              price_stores: {
                where: {
                  deleted_by: null,
                  deleted_at: null,
                },
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
              deleted_at: true,
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
        meta: {
          page,
          take,
          total,
          takeTotal: items.length,
        },
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const items = await this.dbService.items.findFirst({
        where: {
          id,
          // deleted_at: null,
          // deleted_by: null,
        },
        include: {
          category: true,
          prices: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              item_id: true,
              periodic_start: true,
              periodic_end: true,
              is_active: true,
              price_stores: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
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
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async update(id: number, UpdateDataDto: UpdateItemDto, user_id: number) {
    try {
      const item = await this.dbService.items.findFirst({
        where: { id },
        select: {
          id: true,
          prices: {
            select: {
              id: true,
              item_id: true,
              price_stores: true,
              is_active: true,
            },
          },
        },
      });

      const allStores = await this.dbService.store.findMany({
        select: {
          id: true,
          store_name: true,
        },
      });

      // Validasi: invoice_nominal tidak boleh melebihi default_price
      if (UpdateDataDto.invoice_nominal !== undefined && UpdateDataDto.default_price !== undefined) {
        if (Number(UpdateDataDto.invoice_nominal) > Number(UpdateDataDto.default_price)) {
          throw new BadRequestException(
            `invoice_nominal (${UpdateDataDto.invoice_nominal}) tidak boleh melebihi default_price (${UpdateDataDto.default_price})`,
          );
        }
      } else if (UpdateDataDto.invoice_nominal !== undefined) {
        // Jika hanya invoice_nominal yang diupdate, cek default_price dari item di DB
        const currentItem = await this.dbService.items.findFirst({
          where: { id },
          select: { default_price: true },
        });
        if (currentItem && Number(UpdateDataDto.invoice_nominal) > Number(currentItem.default_price)) {
          throw new BadRequestException(
            `invoice_nominal (${UpdateDataDto.invoice_nominal}) tidak boleh melebihi default_price item (${currentItem.default_price})`,
          );
        }
      }

      // define it as and number that have an array of objects
      const storeGroups = new Map<number, Array<store>>();
      const pricesStoreIds: Array<{ id: number; store_id: number }> = [];

      const priceUpsert: Prisma.pricesUpsertWithWhereUniqueWithoutItemsInput[] =
        await Promise.all(
          UpdateDataDto.prices.map(async (price) => {
            const priceStoreCreate: Prisma.price_storesCreateManyPriceInput[] =
              [];
            const priceStoreUpsert: Prisma.price_storesUpsertWithWhereUniqueWithoutPriceInput[] =
              [];

            for (const value of price.price_store) {
              if (value.all_store) {
                priceStoreCreate.push(
                  ...allStores.map(({ id }) => ({ store_id: id })),
                );
              } else if (value.store_group_id) {
                if (!storeGroups.has(value.store_group_id)) {
                  const storeGroup = await this.dbService.store_group.findFirst(
                    {
                      where: {
                        id: value.store_group_id,
                      },
                      include: {
                        store: true,
                      },
                    },
                  );
                  storeGroups.set(value.store_group_id, storeGroup.store);
                }
                const storeGroup = storeGroups.get(value.store_group_id);
                priceStoreCreate.push(
                  ...storeGroup?.map(({ id }) => ({ store_id: id })),
                );
              } else {
                pricesStoreIds.push({
                  id: value?.id,
                  store_id: value.store_id,
                });
                priceStoreUpsert.push({
                  where: { id: value?.id ?? 0 },
                  update: { store_id: value.store_id },
                  create: { store_id: value.store_id },
                });
                priceStoreCreate.push({ store_id: value.store_id });
              }
            }
            // console.log(Boolean(price.is_active));

            return {
              where: { item_id: id, id: price?.id ?? 0 },
              update: {
                periodic_start: price?.periodic_start
                  ? new Date(price.periodic_start)
                  : undefined,
                periodic_end: price?.periodic_end
                  ? new Date(price.periodic_end)
                  : undefined,
                min_order: price?.min_order,
                is_active: Boolean(price?.is_active),
                price: price.price,
                price_stores: {
                  upsert: priceStoreUpsert,
                },
                updated_by: user_id,
                updated_at: new Date(),
              },
              create: {
                is_active: Boolean(price?.is_active),
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
          type: UpdateDataDto?.item_type,
          invoice_nominal: UpdateDataDto?.invoice_nominal,
          item_code: UpdateDataDto?.item_code,
          item_name: UpdateDataDto?.item_name,
          service_name: UpdateDataDto?.name,
          category_id: UpdateDataDto?.category_id,
          default_price: UpdateDataDto?.default_price,
          prices: { upsert: priceUpsert },
          is_active: Boolean(UpdateDataDto?.is_active),
        },
      };

      const [_1, _2, updateItem] = await this.dbService.$transaction([
        this.dbService.price_stores.updateMany({
          where: {
            id: {
              notIn: pricesStoreIds
                .filter(({ id }) => Boolean(id))
                .map(({ id }) => id),
            },
            price_id: {
              in: item.prices.map(({ id }) => id),
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
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
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const items = await this.dbService.items.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        items,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePriceExpired() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const now = new Date();

      const priceExpired = await this.dbService.prices.findMany({
        where: {
          periodic_end: {
            lt: now,
          },
          is_active: true,
        },
        take: 50,
      });

      if (priceExpired.length > 0) {
        const priceExpiredIds = priceExpired.map((item) => item.id);

        await this.dbService.prices.updateMany({
          where: {
            id: {
              in: priceExpiredIds,
            },
          },
          data: {
            is_active: false,
          },
        });

        // console.log('SUCCESS UPDATE PRICES');
      } else {
        // console.log('No expired prices found');
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

}
