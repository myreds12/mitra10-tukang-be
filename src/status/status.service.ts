import { Injectable } from '@nestjs/common';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { connect } from 'http2';
import { HttpStatus } from '@nestjs/common';
@Injectable()
export class StatusService {
  constructor(private readonly dbService: PrismaService) { }

  async create(createStatusDto: CreateStatusDto, user_id) {
    try {
      const status = await this.dbService.status.create({
        data: {
          description: createStatusDto.description,
          category: createStatusDto.category,
        }
      })
      return {
        status: HttpStatus.OK,
        message: "Success Create Status"
      }
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Failed To Create Data"
      }
    }
  }

  async findAll() {
    try {
      const status = await this.dbService.status.findMany({})

      return {
        status: HttpStatus.OK,
        message: 'Get All Data',
        data: status
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
      const status = await this.dbService.status.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Find One Data',
        data: status
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find Data'
      }
    }
  }

  async update(id: number, updateStatusDto: UpdateStatusDto, user_id) {
    try {
      await this.dbService.status.update({
        where: {
          id
        },
        data: {
          ...updateStatusDto,
          updated_at: new Date()
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
      await this.dbService.status.delete({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Delete Data'
      }
    } catch (err) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete'
      }
    }
  }
}
