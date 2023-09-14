import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';
import { PrismaService } from 'src/prisma/prisma.service';

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
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data',
      };
    }
  }

  async findAll() {
    try {
      const service_type = await this.dbService.service_type.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: service_type,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Get Data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const service_type = await this.dbService.service_type.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: service_type,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
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

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data',
      };
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

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }
}
