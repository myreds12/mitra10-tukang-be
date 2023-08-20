import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateVendorServiceDto } from './dto/create-vendor_service.dto';
import { UpdateVendorServiceDto } from './dto/update-vendor_service.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorServiceService {
  constructor(private readonly dbService: PrismaService) {}

  async create(createVendorServiceDto: CreateVendorServiceDto, user_id) {
    try {
      const vendor = await this.dbService.vendor_service.create({
        data: {
          created_by: user_id,
          service_type: {
            connect: { id: createVendorServiceDto.service_type_id },
          },
          vendor: {
            connect: { id: createVendorServiceDto.vendor_id },
          },
        },
      });

      return {
        vendor_service: vendor,
        status: HttpStatus.CREATED,
        message: 'Successfully create data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create',
      };
    }
  }

  async findAll() {
    try {
      const vendor_service_data =
        await this.dbService.vendor_service.findMany();

      return {
        data: {
          vendor_service_data,
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
      const vendor_service_data = await this.dbService.vendor_service.findFirst(
        {
          where: { id: id },
        },
      );

      return {
        data: {
          vendor_service_data,
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
    updateVendorServiceDto: UpdateVendorServiceDto,
    user_id,
  ) {
    try {
      const vendor_update = await this.dbService.vendor_service.update({
        where: { id: id },
        data: {
          ...updateVendorServiceDto,
          updated_at: new Date(),
          updated_by: user_id,
        },
      });
      return {
        data: {
          vendor_service: vendor_update,
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
      const vendor_delete = await this.dbService.vendor_service.update({
        where: { id: id },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
      return {
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
