import { Injectable } from '@nestjs/common';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class StatusService {
  constructor(private readonly dbService: PrismaService) {}

  async create(createStatusDto: CreateStatusDto) {
    try {
      const status = await this.dbService.status.create({
        data: {
          description: createStatusDto.description,
          category: createStatusDto.category,
          status_urgency: createStatusDto.status_urgency,
        },
      });

      return status;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { status, skip, take } = query;

      const data = await this.dbService.status.findMany({
        skip: skip,
        take: take > 0 ? take : undefined,

        where: {
          id: {
            in: status ?? undefined,
          },
        },
      });

      return data;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          id,
        },
      });

      return status;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async update(id: number, updateStatusDto: UpdateStatusDto) {
    try {
      await this.dbService.status.update({
        where: {
          id,
        },
        data: {
          ...updateStatusDto,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.dbService.status.delete({
        where: {
          id,
        },
      });
    } catch (err) {
      console.log(err);
      throw err;
    }
  }
}
