import { Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class PromotionService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createPromotionDto: CreatePromotionDto, user: users) {
    try {
      const { id: user_id } = user;
      const promotionStore: Prisma.promotion_storesCreateManyPromotionInput[] = createPromotionDto.promotion_store ? createPromotionDto.promotion_store.map((item) => {
        return {
          store_id: item.store_id,
          created_at: new Date(),
          created_by: user_id
        }
      }) : undefined;

      const data: Prisma.promotionCreateInput = {
        min_order: createPromotionDto.min_order,
        promotion: createPromotionDto.promotion,
        promotion_type: createPromotionDto.promotion_type,
        created_by: user_id,
        created_at: new Date(),
        promotion_stores: {
          createMany: {
            data: promotionStore
          }
        }
      };

      const [promotion] = await this.dbService.$transaction([
        this.dbService.promotion.create({
          data
        })
      ]);

      return promotion
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async findAll(queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
      } = queryParams;
      

      const skip = page * take - take;

      const where: Prisma.promotionWhereInput = {
        AND: [
          ...(search ? [
            {
              OR: [
                { promotion: { equals: Number(search) } },
                { promotion_type: { equals: Number(search) } },
              ],
            },
          ] : []),
          ...(date_from && date_to ? [
            {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            },
          ] : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const promotions = await this.dbService.promotion.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          promotion_stores: {
            where: {
              deleted_at: null,
            },
            select: {
              store: {
                select: {
                  id: true,
                  store_name: true,
                  address: true,
                },
              },
            },
          },
        },
      });

      const count = await this.dbService.promotion.count({
        where,
      });

      return {
        data: promotions,
        meta: {
          total: count,
          page,
          take,
          takeTotal: promotions.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const promotion = await this.dbService.promotion.findUnique({
        where: { id },
        include: {
          promotion_stores: {
            include: {
              store: true
            }
          },
        },
      });

      return promotion;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updatePromotionDto: UpdatePromotionDto, user: users) {
    try {
      const { id: user_id } = user;
      const promotionStore : Prisma.promotion_storesUpsertWithWhereUniqueWithoutPromotionInput[] = updatePromotionDto.promotion_store
        ? updatePromotionDto.promotion_store.map((item) => {
          return{
            where: {
              id: item.id ?? 0
            },
            create: {
              store_id: item.store_id,
              created_by: user_id,
              created_at: new Date()
            },
            update: {
              store_id: item.store_id,
              updated_by: user_id,
              updated_at: new Date()
            }
          }
        }) : [];

      const data: Prisma.promotionUpdateInput = {
        min_order: updatePromotionDto.min_order,
        promotion: updatePromotionDto.promotion,
        promotion_type: updatePromotionDto.promotion_type,
        promotion_stores: {
          upsert: promotionStore,
        },
      };

      const [syncPromotionStore, updatePromotion] = await this.dbService.$transaction([
        this.dbService.promotion_stores.updateMany({
          where: {
            promotion_id: id,
            id: {
              notIn: updatePromotionDto.promotion_store.map(({id}) => id)
            }
          },
          data: {
            deleted_by: user_id,
            deleted_at: new Date()
          }
        }),
        this.dbService.promotion.update({
          where: {
            id
          },
          data,
          include: {
            promotion_stores: {
              include: {
                store: true
              }
            }
          }
        })
      ]);

      return updatePromotion
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const{id: user_id} = user;
      return await this.dbService.promotion.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id
        }
      });
      
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
