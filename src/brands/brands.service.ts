import { Injectable } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createBrandDto: CreateBrandDto, user: users) {
    try {
      const { id: user_id } = user;
      const brands = await this.dbService.brands.create({
        data: {
          ...createBrandDto,
          created_by: user_id,
        },
      });
      return brands;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { search, take, page } = query;
      const skip = page * take - take;

      const where: Prisma.brandsWhereInput = {
        ...(search
          ? {
              name: {
                contains: search,
              },
            }
          : {}),
      };
      const brands = await this.dbService.brands.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
      });

      const total = await this.dbService.brands.count({
        where,
      });

      return {
        data: brands,
        meta: {
          page,
          take,
          skip,
          total,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const brands = await this.dbService.brands.findFirst({
        where: {
          id,
        },
      });
      return brands;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateBrandDto: UpdateBrandDto, user: users) {
    try {
      const { id: user_id } = user;
      const brands = await this.dbService.brands.update({
        where: {
          id,
        },
        data: {
          ...updateBrandDto,
          updated_at: new Date(),
          updated_by: user_id,
        },
      });

      return brands;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const { id: user_id } = user;
      const brands = await this.dbService.brands.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
          is_active: false,
        },
      });
      return brands;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
