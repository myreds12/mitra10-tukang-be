import { HttpStatus, Injectable } from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createPermissionDto: CreatePermissionDto) {
    try {
      const permissions = await this.dbService.permissions.create({
        data: {
          ...createPermissionDto
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data'
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
      const permissions = await this.dbService.permissions.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: permissions
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
      const permissions = await this.dbService.permissions.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: permissions
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updatePermissionDto: UpdatePermissionDto) {
    try {
      const permissions = await this.dbService.permissions.update({
        where: {
          id
        },
        data: {
          name: updatePermissionDto.name,
          updated_at: new Date()
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data'
      }
    }
  }

  async remove(id: number) {
    try {
      const permissions = await this.dbService.permissions.update({
        where: {
          id
        },
        data: {
          is_active: false,
          deleted_at: new Date()
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
