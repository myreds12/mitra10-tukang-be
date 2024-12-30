/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateIncentiveDto } from './dto/create-incentive.dto';
import { UpdatedIncentiveDto } from './dto/update-incentive.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class IncentiveService {
  constructor(private readonly dbService: PrismaService) {}
  private readonly logger = new Logger(IncentiveService.name);

  async create(createIncentiveDto: CreateIncentiveDto) {
    try {
      const assignedStores = await this.dbService.store.findMany({
        where: {
          deleted_at: null,
          deleted_by: null,
          id: {
            in: createIncentiveDto.stores,
          },
        },
        select: {
          id: true,
        },
      });
      const uniqueStoreIds = new Set(createIncentiveDto.stores);
      const assignedStoreIds = new Set(assignedStores.map((store) => store.id));

      if (uniqueStoreIds.size !== assignedStoreIds.size) {
        const invalidStoreIds = [...uniqueStoreIds].filter(
          (id) => !assignedStoreIds.has(id),
        );
        throw new BadRequestException(
          `The following store IDs are not valid: ${invalidStoreIds.join(
            ', ',
          )}`,
        );
      }

      const data = await this.dbService.setting_incentive.create({
        data: {
          name: createIncentiveDto.name,
          max_order: createIncentiveDto.max_order,
          min_order: createIncentiveDto.min_order,
          incentive: createIncentiveDto.incentive,
          type: createIncentiveDto.type,
          stores: {
            createMany: {
              data: assignedStores.map((store) => ({
                store_id: store.id,
              })),
            },
          },
        },
      });

      return data;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { take, page, order_by, store_id, search } = query;
      const skip = page * take - take;

      const where: Prisma.setting_incentiveWhereInput = {
        deleted_at: null,
        deleted_by: null,
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      name: {
                        contains: search,
                      },
                    },
                  ],
                },
              ]
            : []),
          store_id
            ? {
                stores: {
                  some: {
                    store_id: {
                      in: store_id,
                    },
                  },
                },
              }
            : undefined,
        ].filter(Boolean),
      };
      this.logger.verbose(where);

      const count = await this.dbService.setting_incentive.count({ where });

      const data = await this.dbService.setting_incentive.findMany({
        where,
        skip,
        take,
        orderBy: {
          created_at: order_by,
        },
        select: {
          id: true,
          name: true,
          type: true,
          min_order: true,
          max_order: true,
          incentive: true,
          stores: {
            select: {
              store_id: true,
              store: true,
            },
          },
        },
      });

      return {
        data,
        meta: {
          total: count,
          page,
          take,
          takeTotal: data.length,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const where: Prisma.setting_incentiveWhereInput = {
        deleted_at: null,
        deleted_by: null,
        id,
      };
      const data = await this.dbService.setting_incentive.findFirstOrThrow({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          min_order: true,
          max_order: true,
          incentive: true,
          stores: {
            select: {
              store_id: true,
              store: true,
            },
          },
        },
      });

      return data;
    } catch (error) {
      this.logger.error(error, JSON.stringify(error));
      throw error;
    }
  }

  async update(id: number, updateIncentiveDto: UpdatedIncentiveDto) {
    try {
      const incentive = await this.findOne(id);
      const assignedStores = await this.dbService.store.findMany({
        where: {
          deleted_at: null,
          deleted_by: null,
          id: {
            in: updateIncentiveDto.stores,
          },
        },
        select: {
          id: true,
        },
      });
      const uniqueStoreIds = new Set(updateIncentiveDto.stores);
      const assignedStoreIds = new Set(assignedStores.map((store) => store.id));

      if (uniqueStoreIds.size !== assignedStoreIds.size) {
        const invalidStoreIds = [...uniqueStoreIds].filter(
          (id) => !assignedStoreIds.has(id),
        );
        throw new BadRequestException(
          `The following store IDs are not valid: ${invalidStoreIds.join(
            ', ',
          )}`,
        );
      }

      const newStoreIds = updateIncentiveDto.stores;
      const currentStoreIds = incentive.stores.map((store) => store.store_id);

      const storesToAdd = newStoreIds.filter(
        (id) => !currentStoreIds.includes(id),
      );
      const storesToRemove = currentStoreIds.filter(
        (id) => !newStoreIds.includes(id),
      );

      this.logger.verbose('Store to add : ', storesToAdd);
      this.logger.verbose('Store to remove : ', storesToRemove);

      const [update] = await this.dbService.$transaction([
        this.dbService.setting_incentive.update({
          where: {
            id: incentive.id,
          },
          data: {
            name: updateIncentiveDto.name,
            max_order: updateIncentiveDto.max_order,
            min_order: updateIncentiveDto.min_order,
            incentive: updateIncentiveDto.incentive,
            type: updateIncentiveDto.type,
            stores: {
              createMany: storesToAdd.length
                ? {
                    data: storesToAdd.map((store) => ({
                      store_id: store,
                    })),
                  }
                : undefined,
              deleteMany: storesToRemove.length
                ? {
                    store_id: {
                      in: storesToRemove,
                    },
                  }
                : undefined,
            },
          },
        }),
      ]);

      return update;
    } catch (error) {
      throw error;
    }
  }

  async remove(id: number) {
    try{
      const incentive = await this.dbService.setting_incentive.update({
        where: {
          id: id,
        },
        data: {
          deleted_at: new Date
        }
      })

      return incentive
    }catch(error){
      console.log(error)
      throw error
    }
  }
}
