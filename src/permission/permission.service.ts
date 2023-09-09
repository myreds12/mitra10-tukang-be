import { Injectable, HttpStatus } from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private readonly dbService: PrismaService) {}

  async create(createPermissionDto: CreatePermissionDto) {
    try {
      const permission = await this.dbService.permissions.create({
        data: {
          name: createPermissionDto.name,
        },
      });
      return {
        status: HttpStatus.CREATED,
        message: 'Success Create',
        data: {
          permission,
        },
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Create',
      };
    }
  }

  async findAll() {
    try {
      const permission = await this.dbService.permissions.findMany();
      return {
        status: HttpStatus.OK,
        message: 'Successfully get data',
        data: {
          permission,
        },
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Get Data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const permission = await this.dbService.permissions.findFirst({
        where: { id: id },
      });
      return {
        status: HttpStatus.OK,
        message: 'Successfully get data',
        data: {
          permission,
        },
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Get Data',
      };
    }
  }

  async update(id: number, updatePermissionDto: UpdatePermissionDto) {
    try {
      const permission = await this.dbService.permissions.update({
        where: { id: id },
        data: updatePermissionDto,
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Success Update',
        data: permission,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Update',
      };
    }
  }

  async remove(id: number) {
    try {
      const permission = await this.dbService.permissions.update({
        where: { id: id },
        data: {
          is_active: false,
        },
      });
      return {
        status: HttpStatus.OK,
        message: 'Success To Delete',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Delete',
      };
    }
  }
}
