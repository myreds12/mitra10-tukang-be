import { Injectable } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createBrandDto: CreateBrandDto, user: users) {
    const { id: user_id } = user;
    const brands = await this.dbService.brands.create({
      data: {
        ...createBrandDto,
        created_by: user_id,
      },
    });
    return brands;
  }

  async findAll(query: QueryParamsDto) {
    const {search, take, page} = query;
    const skip = page * take - take;


    const where : Prisma.brandsWhereInput = {
    ...(search ? { name: {
        contains: search
      }}: {})
    }
    const brands = await this.dbService.brands.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
    });

    const total = await this.dbService.brands.count({
      where
    })

    return {
      data: brands,
      page,
      take,
      skip,
      total
    };
  }

  async findOne(id: number) {
    const brands = await this.dbService.brands.findFirst({
      where: {
        id,
      },
    });
    return brands;
  }

  async update(id: number, updateBrandDto: UpdateBrandDto, user: users) {
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
  }

  async remove(id: number, user: users) {
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
  }
}
