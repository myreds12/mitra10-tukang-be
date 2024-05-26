import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createRoleDto: CreateRoleDto, user_id: number) {
    try {
      const roles = await this.dbService.roles.create({
        data: {
          ...createRoleDto,
          created_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully Create',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create',
      };
    }
  }

  async findAll() {
    try {
      const roles = await this.dbService.roles.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Success Get Data',
        data: roles,
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
      const roles = await this.dbService.roles.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: roles,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(id: number, updateRoleDto: UpdateRoleDto, user_id: number) {
    try {
      const roles = await this.dbService.roles.update({
        where: {
          id,
        },
        data: {
          ...updateRoleDto,
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
        message: 'Failed To Update Data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const roles = await this.dbService.roles.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_by: user_id,
          deleted_at: new Date(),
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully Deleted Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete',
      };
    }
  }
}
