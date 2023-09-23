import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateRoleMenuDto } from './dto/create-role_menu.dto';
import { UpdateRoleMenuDto } from './dto/update-role_menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoleMenusService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createRoleMenuDto: CreateRoleMenuDto, user_id: number) {
    try {
      const role = await this.dbService.roles.findFirst({
        where: {
          id: createRoleMenuDto.role_id
        }
      })

      const menu = await this.dbService.menus.findFirst({
        where: {
          id: createRoleMenuDto.menu_id
        }
      })

      if (role.is_active && menu.is_active == true) {
        const role_menus = await this.dbService.role_menus.create({
          data: {
            roles: {
              connect: {
                id: createRoleMenuDto.role_id
              }
            },
            menus: {
              connect: {
                id: createRoleMenuDto.menu_id
              }
            },
            created_by: user_id
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        let error_message: string

        if (role.is_active == false) {
          error_message = 'Roles is not Active'
        }

        if (menu.is_active == false) {
          error_message = 'Menus is not Active'
        }

        if (menu.is_active && role.is_active == false) {
          error_message = 'Roles and Menus is not Active'
        }

        return {
          status: HttpStatus.BAD_REQUEST,
          message: error_message
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
      const role_menus = await this.dbService.role_menus.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: role_menus
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
      const role_menus = await this.dbService.role_menus.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: role_menus
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateRoleMenuDto: UpdateRoleMenuDto, user_id: number) {
    try {
      const role = await this.dbService.roles.findFirst({
        where: {
          id: updateRoleMenuDto.role_id
        }
      })

      const menu = await this.dbService.menus.findFirst({
        where: {
          id: updateRoleMenuDto.menu_id
        }
      })

      if (role.is_active && menu.is_active == true) {
        const role_menus = await this.dbService.role_menus.update({
          where: {
            id
          },
          data: {
            roles: {
              connect: {
                id: updateRoleMenuDto.role_id
              }
            },
            menus: {
              connect: {
                id: updateRoleMenuDto.menu_id
              }
            },
            updated_at: new Date(),
            updated_by: user_id
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Update Data'
        }
      } else {
        let error_message: string

        if (role.is_active == false) {
          error_message = 'Roles is not Active'
        }

        if (menu.is_active == false) {
          error_message = 'Menus is not Active'
        }

        if (menu.is_active && role.is_active == false) {
          error_message = 'Roles and Menus is not Active'
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

  async remove(id: number, user_id: number) {
    try {
      const role_menus = await this.dbService.role_menus.update({
        where: {
          id
        },
        data: {
          updated_at: new Date(),
          updated_by: user_id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data'
      }
    }
  }
}
