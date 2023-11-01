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
    work_order_evidences?: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;

    const evidences: Array<Prisma.work_order_evidencesCreateManyWork_ordersInput> =
      work_order_evidences?.map((evidences) => ({
        evidence_location: evidences.filename,
        created_by: user_id,
      }));

    console.log(dataDto.work_order_tukang);

    const workOrderTukang: Prisma.work_order_tukangCreateManyWork_ordersInput[] =
      dataDto.work_order_tukang?.map((item) => {
        return {
          tukang_id: item.tukang_id,
          created_by: user_id,
        };
      });

    console.log(workOrderTukang);

    // return console.log(tukangConn);

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
        vendor: {
          connect: {
            id: dataDto.vendor_id,
          },
        },
        ...(evidences
          ? {
              work_order_evidences: {
                createMany: {
                  data: evidences,
                },
              },
            }
          : undefined),
        work_order_tukang: {
          createMany: {
            data: workOrderTukang,
          },
        },
      },
    };
    // await this.dbService.orders.update({
    //   where: {
    //     id: dataDto.order_id,
    //   },
    //   data: {
    //     project_status_id: dataDto.work_order_status,
    //   },
    // });
    const [work_order, order_update] = await this.dbService.$transaction([
      this.dbService.work_orders.create(work_order_data),
      this.dbService.orders.update({
        where: {
          id: dataDto.order_id,
        },
        data: {
          project_status_id: dataDto.work_order_status,
        },
      }),
    ]);

    return work_order;
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { page, take, search, date_from, date_to, status, order_by } =
      queryParamsDto;
    const skip = page * take - take;
    const total = await this.dbService.work_orders.count();
    const where: Prisma.work_ordersWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { request_work_time: { equals: new Date(search) } },
                  { survey_date: { equals: new Date(search) } },
                  { work_start_date: { equals: new Date(search) } },
                  { work_end_date: { equals: new Date(search) } },
                ],
              },
            ]
          : []),
        ...(status ? [{ status: { id: { equals: status } } }] : []),
        date_from && date_to
          ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
          : undefined,
      ].filter(Boolean),
      deleted_at: null,
    };
    const work_orders = await this.dbService.work_orders.findMany({
      skip,
      take: take <= 0 ? undefined : take,
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        order: true,
        work_order_tukang: {
          include: {
            tukang: true,
          },
        },
        vendor: true,
        work_order_evidences: true,
      },
    });

    return { data: work_orders, skip, page, take, total };
  }

  async findOne(id: number) {
    const work_orders = await this.dbService.work_orders.findFirst({
      where: {
        id,
      },
      include: {
        order: true,
        work_order_tukang: {
          include: {
            tukang: true,
          },
        },
        vendor: true,
        work_order_evidences: true,
      },
    });

    return work_orders;
  }

  async update(
    id: number,
    dataDto: UpdateWorkOrderDto,
    user: users,
    work_order_evidences: Express.Multer.File[],
  ) {
    const { id: user_id } = user;
    const evidences: Array<Prisma.work_order_evidencesUpdateInput> =
      work_order_evidences.map((evidences) => ({
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
        vendor: {
          connect: {
            id: dataDto.vendor_id,
          },
        },
        work_order_evidences: {
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
    await this.dbService.work_orders.update({
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
