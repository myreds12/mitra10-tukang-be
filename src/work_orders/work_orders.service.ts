import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update.dto';
import { Prisma, users } from '@prisma/client';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly dbService: PrismaService) {}

  async create(
    dataDto: CreateWorkOrderDto,
    user: users,
    work_evidences: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;
    const evidences: Array<Prisma.work_evidencesCreateManyWork_ordersInput> =
      work_evidences.map((evidences) => ({
        evidence_location: evidences.filename,
        created_by: user_id,
      }));

    const work_order_data: Prisma.work_ordersCreateArgs = {
      data: {
        request_work_time: new Date(dataDto.request_work_time),
        survey_date: new Date(dataDto.survey_date),
        work_start_date: new Date(dataDto.work_start_date),
        work_end_date: new Date(dataDto.work_end_date),
        status: {
          connect: {
            id: dataDto.work_order_status,
          },
        },
        order: {
          connect: {
            id: dataDto.order_id,
          },
        },
        tukang: {
          connect: {
            id: dataDto.tukang_id,
          },
        },
        vendor: {
          connect: {
            id: dataDto.vendor_id,
          },
        },
        work_evidences: {
          createMany: {
            data: evidences,
          },
        },
      },
    };
    const orders = await this.dbService.orders.update({
      where: {
        id: dataDto.order_id,
      },
      data: {
        project_status_id: dataDto.work_order_status,
      },
    });
    const [work_order] = await this.dbService.$transaction([
      this.dbService.work_orders.create(work_order_data),
    ]);

    return work_order;
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { skip, take, search, date_from, date_to } = queryParamsDto;
    const work_orders = await this.dbService.work_orders.findMany({
      skip: skip,
      take: take,
      where: {
        request_work_time: {
          gte: new Date(search) ?? undefined,
        },
        survey_date: {
          gte: new Date(search) ?? undefined,
        },
      },
      include: {
        order: true,
        tukang: true,
        vendor: true,
        work_evidences: true,
      },
    });

    return work_orders;
  }

  async findOne(id: number) {
    const work_orders = await this.dbService.work_orders.findFirst({
      where: {
        id,
      },
      include: {
        order: true,
        tukang: true,
        vendor: true,
        work_evidences: true,
      },
    });

    return work_orders;
  }

  async update(
    id: number,
    dataDto: UpdateWorkOrderDto,
    user: users,
    work_evidences: Express.Multer.File[],
  ) {
    const { id: user_id } = user;
    const evidences: Array<Prisma.work_evidencesUpdateInput> =
      work_evidences.map((evidences) => ({
        evidence_location: evidences.filename,
        updated_at: new Date(),
        updated_by: user_id,
      }));

    const work_order_data: Prisma.work_ordersUpdateArgs = {
      where: {
        id,
      },
      data: {
        request_work_time: new Date(dataDto.request_work_time),
        survey_date: new Date(dataDto.survey_date),
        work_start_date: new Date(dataDto.work_start_date),
        work_end_date: new Date(dataDto.work_end_date),
        status: {
          connect: {
            id: dataDto.work_order_status,
          },
        },
        order: {
          connect: {
            id: dataDto.order_id,
          },
        },
        tukang: {
          connect: {
            id: dataDto.tukang_id,
          },
        },
        vendor: {
          connect: {
            id: dataDto.vendor_id,
          },
        },
        work_evidences: {
          updateMany: {
            where: {
              work_order_id: id,
            },
            data: evidences,
          },
        },
      },
    };

    const [work_order] = await this.dbService.$transaction([
      this.dbService.work_orders.update(work_order_data),
    ]);

    return work_order;
  }

  async delete(id: number, user_id: number) {
    const work_orders = await this.dbService.work_orders.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });
  }
}
