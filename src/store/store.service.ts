import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { isNumber } from 'class-validator';
import { Prisma } from '@prisma/client';

@Injectable()
export class StoreService {
  constructor(private readonly dbService: PrismaService) {}
  async create(dto: CreateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.create({
        data: {
          store_name: dto.store_name,
          address: dto.address,
          city_id: dto.city_id,
          zip_code: dto.zip_code,
          created_by: user_id,
        },
      });

      return {
        data: {
          store,
        },
        status: HttpStatus.CREATED,
        message: 'Store Successfully Created',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      status,
      date_from,
      date_to,
      order_by,
      city_id,
    } = query;

    const skip = page * take - take;

    const where: Prisma.storeWhereInput = {
      city_id: city_id ?? undefined,
    };

    const store = await this.dbService.store.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        city: true,
      },
    });

    return {
      data: store,
      total: store.length,
      page,
      take,
    };
  }

  async findOne(id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Succesfully find store',
        data: store,
      };
    } catch (error) {}
  }

  async update(id: number, dto: UpdateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          ...dto,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully Update Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to update data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const store = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          deleted_by: user_id,
          deleted_at: new Date(),
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully delete store',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to delete store',
      };
    }
  }
}
