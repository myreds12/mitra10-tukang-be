import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateTukangServiceDto } from './dto/create-tukang_service.dto';
import { UpdateTukangServiceDto } from './dto/update-tukang_service.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TukangServiceService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createTukangServiceDto: CreateTukangServiceDto, user_id) {
    try {
      const tukang_service = await this.dbService.tukang_service.create({
        data: {
          tukang: { connect: { id: createTukangServiceDto.tukang_id } },
          service_type: {
            connect: { id: createTukangServiceDto.service_type_id },
          },
          created_by: user_id,
        },
      });
      return {
        data: {
          tukang_service,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully create data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create data',
      };
    }
  }

  async findAll() {
    try {
      const tukang_service = await this.dbService.tukang_service.findMany();

      return {
        data: {
          tukang_service,
        },
        status: HttpStatus.OK,
        message: 'Successfully get data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const tukang_service = await this.dbService.tukang_service.findFirst({
        where: { id: id },
      });
      return {
        data: {
          tukang_service,
        },
        status: HttpStatus.OK,
        message: 'Successfully get data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async update(
    id: number,
    updateTukangServiceDto: UpdateTukangServiceDto,
    user_id,
  ) {
    try {
      const tukang_service = await this.dbService.tukang_service.update({
        where: { id: id },
        data: {
          ...updateTukangServiceDto,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      return {
        data: {
          tukang_service,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully update data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to update data',
      };
    }
  }

  async remove(id: number, user_id) {
    try {
      const tukang_service = await this.dbService.tukang_service.update({
        where: { id: id },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
      return {
        data: {
          tukang_service,
        },
        status: HttpStatus.OK,
        message: 'Successfully delete data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to delete data',
      };
    }
  }
}
