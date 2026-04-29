import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class ServiceTypeService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createServiceTypeDto: CreateServiceTypeDto, user_id: number) {
    try {
      const service_type = await this.dbService.service_type.create({
        data: {
          ...createServiceTypeDto,
          created_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data',
        data: service_type,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { take, page, search } = query;
      const skip = page * take - take;
      const service_type = await this.dbService.service_type.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where: {
          service_type: {
            contains: search ? search : undefined,
          },
        },
      });

      return {
        data: service_type,
        meta: {
          total: service_type.length,
          page,
          take,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const service_type = await this.dbService.service_type.findFirst({
        where: {
          id,
        },
      });

      return service_type;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateServiceTypeDto: UpdateServiceTypeDto,
    user_id: number,
  ) {
    try {
      const service_type = await this.dbService.service_type.update({
        where: {
          id,
        },
        data: {
          ...updateServiceTypeDto,
          updated_at: new Date(),
          updated_by: user_id,
        },
      });

      return service_type;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const service_type = await this.dbService.service_type.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return service_type;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
