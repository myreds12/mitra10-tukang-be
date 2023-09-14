import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ItemsService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createItemDto: CreateItemDto, user_id: number) {
    try {
      const items = await this.dbService.items.create({
        data: {
          store: {
            connect: {
              id: createItemDto.store_id,
            },
          },
          item_name: createItemDto.item_name,
          unit: createItemDto.unit,
          discount: createItemDto.discount,
          price: createItemDto.price,
          created_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data',
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
      const items = await this.dbService.items.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: items,
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
      const items = await this.dbService.items.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: items,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(id: number, updateItemDto: UpdateItemDto, user_id: number) {
    try {
      const items = await this.dbService.items.update({
        where: {
          id,
        },
        data: {
          store: {
            connect: {
              id: updateItemDto.store_id,
            },
          },
          item_name: updateItemDto.item_name,
          unit: updateItemDto.unit,
          discount: updateItemDto.discount,
          price: updateItemDto.price,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data',
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
      const items = await this.dbService.items.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }
}
