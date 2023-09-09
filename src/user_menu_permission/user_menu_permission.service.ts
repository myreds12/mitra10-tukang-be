import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateUserMenuPermissionDto } from './dto/create-user_menu_permission.dto';
import { UpdateUserMenuPermissionDto } from './dto/update-user_menu_permission.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { connect } from 'http2';

@Injectable()
export class UserMenuPermissionService {
  constructor(private readonly dbService: PrismaService) {}

  async create(createUserMenuPermissionDto: CreateUserMenuPermissionDto) {
    try {
      const user_permission = await this.dbService.user_menu_permissions.create(
        {
          data: {
            users: {
              connect: {
                id: createUserMenuPermissionDto.user_id,
              },
            },
            menus: {
              connect: {
                id: createUserMenuPermissionDto.menu_id,
              },
            },
            permissions: {
              connect: {
                id: createUserMenuPermissionDto.permission_id,
              },
            },
          },
        },
      );
      return {
        status: HttpStatus.CREATED,
        message: 'Success Create',
        data: {
          user_permission,
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
      const user_permission =
        await this.dbService.user_menu_permissions.findMany();
      return {
        status: HttpStatus.OK,
        message: 'Success Get Data',
        data: {
          user_permission,
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
      const user_permission =
        await this.dbService.user_menu_permissions.findFirst({
          where: { id: id },
        });
      return {
        status: HttpStatus.OK,
        message: 'Success Get Data',
        data: {
          user_permission,
        },
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Get Data',
      };
    }
  }

  async update(
    id: number,
    updateUserMenuPermissionDto: UpdateUserMenuPermissionDto,
  ) {
    const user_permission = await this.dbService.user_menu_permissions.update({
      where: { id: id },
      data: updateUserMenuPermissionDto,
    });
  }

  remove(id: number) {}
}
