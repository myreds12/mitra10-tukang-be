import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserMenuPermissionDto } from './dto/create-user_menu_permission.dto';
import { UpdateUserMenuPermissionDto } from './dto/update-user_menu_permission.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserMenuPermissionsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createUserMenuPermissionDto: CreateUserMenuPermissionDto, user_id: number) {
    try {
      const menus = await this.dbService.menus.findFirst({
        where: {
          id: createUserMenuPermissionDto.menu_id
        }
      })

      if (menus.is_active == true) {
        const user_menu_permissions = await this.dbService.user_menu_permissions.create({
          data: {
            users: {
              connect: {
                id: user_id
              }
            },
            menus: {
              connect: {
                id: createUserMenuPermissionDto.menu_id
              }
            }
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Menus is not Active'
        }
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data'
      }
    }
  }

  async findAll() {
    try {
      const user_menu_permissions = await this.dbService.user_menu_permissions.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: user_menu_permissions
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Get Data'
      }
    }
  }

  async findOne(id: number) {
    try {
      const user_menu_permissions = await this.dbService.user_menu_permissions.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: user_menu_permissions
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateUserMenuPermissionDto: UpdateUserMenuPermissionDto, user_id: number) {
    try {
      const menus = await this.dbService.menus.findFirst({
        where: {
          id: updateUserMenuPermissionDto.menu_id
        }
      })

      if (menus.is_active == true) {
        const user_menu_permissions = await this.dbService.user_menu_permissions.update({
          where: {
            id
          },
          data: {
            users: {
              connect: {
                id: user_id
              }
            },
            menus: {
              connect: {
                id: updateUserMenuPermissionDto.menu_id
              }
            },
            updated_at: new Date()
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Update Data'
        }
      } else {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Menus is not Active'
        }
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data'
      }
    }
  }

}
