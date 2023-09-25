import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createCategoryDto: CreateCategoryDto, user_id: number) {
    try {
      await this.dbService.categories.create({
        data: {
          ...createCategoryDto,
          created_by: user_id
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Created'
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create'
      }
    }
  }

  async findAll() {
    try {
      const category = await this.dbService.categories.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Get All Data',
        data: category
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get Data'
      }
    }
  }

  async findOne(id: number) {
    try {
      const category = await this.dbService.categories.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Find Data Data',
        data: category
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While find Data'
      }
    }
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    try {
      await this.dbService.categories.update({
        where: {
          id
        },
        data: {
          ...updateCategoryDto
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Update Data'
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update'
      }
    }
  }

  async remove(id: number, user_id) {
    try {
      const delete_categories = await this.dbService.categories.update({
        where: { id: id },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id
        }
      })
      return {
        status: HttpStatus.OK,
        message: "Success Delete Data"
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Failed To Delete Data"
      }
    }
  }
}
