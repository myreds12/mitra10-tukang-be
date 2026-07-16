import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MenusService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createMenuDto: CreateMenuDto,
    user_id: number,
    file: Express.Multer.File,
  ) {
    try {
      const url = `/uploads/file/${file.filename}`;
      const menus = await this.dbService.menus.create({
        data: {
          icon: createMenuDto.icon,
          parent_id: Number(createMenuDto.parent_id),
          title: createMenuDto.title,
          url: url,
          created_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully Create Data',
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
      const menus = await this.dbService.menus.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Successfully Get Data',
        data: menus,
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
      const menus = await this.dbService.menus.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully Find Data',
        data: menus,
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
    updateMenuDto: UpdateMenuDto,
    user_id: number,
    file: Express.Multer.File,
  ) {
    try {
      const url = file.filename;
      const menus = await this.dbService.menus.update({
        where: {
          id,
        },
        data: {
          icon: updateMenuDto.icon,
          parent_id: Number(updateMenuDto.parent_id),
          title: updateMenuDto.title,
          url: url,
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
        message: 'Failed to Update Data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const menus = await this.dbService.menus.update({
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
        message: 'Successfully Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }
}
