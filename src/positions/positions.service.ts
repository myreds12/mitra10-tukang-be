import { HttpStatus, Injectable } from '@nestjs/common';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PositionsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createPositionDto: CreatePositionDto, user_id: number) {
    try {
      const positions = await this.dbService.positions.create({
        data: {
          ...createPositionDto,
          created_by: user_id,
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully Create Data'
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
      const positions = await this.dbService.positions.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully Get Data',
        data: positions
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
      const positions = await this.dbService.positions.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully Find Data',
        data: positions
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updatePositionDto: UpdatePositionDto, user_id: number) {
    try {
      const positions = await this.dbService.positions.update({
        where: { id },
        data: {
          ...updatePositionDto,
          updated_by: user_id,
          updated_at: new Date()
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully Update Data'
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
      const positions = await this.dbService.positions.update({
        where: {
          id
        },
        data: {
          is_active: false,
          deleted_by: user_id,
          deleted_at: new Date()
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully Delete Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data'
      }
    }
  }
}
