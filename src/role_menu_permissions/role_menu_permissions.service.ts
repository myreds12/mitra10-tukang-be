import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateRoleMenuPermissionDto } from './dto/create-role_menu_permission.dto';
import { UpdateRoleMenuPermissionDto } from './dto/update-role_menu_permission.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoleMenuPermissionsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createRoleMenuPermissionDto: CreateRoleMenuPermissionDto) {
    try {
      const permissions = await this.dbService.permissions.findFirst({
        where: {
          id: createRoleMenuPermissionDto.permission_id,
        }
      })

      const role_menu = await this.dbService.role_menus.findFirst({
        where: {
          id: createRoleMenuPermissionDto.role_menu_id,
        }
      })

      if (role_menu.is_active && permissions.is_active == true) {
        const role_menu_permissions = await this.dbService.role_menu_permissions.create({
          data: {
            permissions: {
              connect: {
                id: createRoleMenuPermissionDto.permission_id
              }
            },
            role_menus: {
              connect: {
                id: createRoleMenuPermissionDto.role_menu_id
              }
            }
          }
        })
        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        let error_message: string

        if (permissions.is_active && role_menu.is_active == false) {
          error_message = 'Permissions and Role Menu is not Active'
        }

        if (permissions.is_active == false) {
          error_message = 'Permissions is not Active'
        }

        if (role_menu.is_active == false) {
          error_message = 'Role Menu is not Active'
        }

        return {
          status: HttpStatus.BAD_REQUEST,
          message: error_message
        }
      }
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data'
      }
    }
  }

  async findAll() {
    try {
      const role_menu_permissions = await this.dbService.role_menu_permissions.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: role_menu_permissions
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
      const role_menu_permissions = await this.dbService.role_menu_permissions.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: role_menu_permissions
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateRoleMenuPermissionDto: UpdateRoleMenuPermissionDto) {
    try {
      const permissions = await this.dbService.permissions.findFirst({
        where: {
          id: updateRoleMenuPermissionDto.permission_id
        }
      })

      const role_menu = await this.dbService.role_menus.findFirst({
        where: {
          id: updateRoleMenuPermissionDto.role_menu_id
        }
      })

      if (role_menu.is_active && permissions.is_active == true) {
        const role_menu_permissions = await this.dbService.role_menu_permissions.update({
          where: {
            id
          },
          data: {
            permissions: {
              connect: {
                id: updateRoleMenuPermissionDto.permission_id
              }
            },
            role_menus: {
              connect: {
                id: updateRoleMenuPermissionDto.role_menu_id
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
        let error_message: string

        if (permissions.is_active && role_menu.is_active == false) {
          error_message = 'Permissions and Role Menu is not Active'
        }

        if (permissions.is_active == false) {
          error_message = 'Permissions is not Active'
        }

        if (role_menu.is_active == false) {
          error_message = 'Role Menu is not Active'
        }

        return {
          status: HttpStatus.BAD_REQUEST,
          message: error_message
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
