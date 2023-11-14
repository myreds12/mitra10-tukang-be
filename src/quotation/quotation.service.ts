import { Injectable } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';

@Injectable()
export class QuotationService {
  constructor(private readonly dbService: PrismaService) {}

  //TODO: FILE UPLOAD => DONE
  // TODOL SYNC WITH TABLE NEEDS => DONE
  async create(
    createQuotationDto: CreateQuotationDto,
    user: users,
    quotaion_files?: Express.Multer.File[],
  ) {
    const { id: user_id } = user;
    const evidence: Array<Prisma.quotation_filesCreateManyQuotationInput> =
      quotaion_files
        ? quotaion_files.map((item) => ({
            path: item.filename,
            created_by: user_id,
          }))
        : undefined;

    const quotation_data = {
      order: {
        connect: {
          id: createQuotationDto.order_id,
        },
      },
      store: {
        connect: {
          id: createQuotationDto.store_id,
        },
      },
      status: {
        connect: {
          id: createQuotationDto.quotation_status,
        },
      },
      description: createQuotationDto.description,
      quotation_number: createQuotationDto.quotation_number,
      quotation_date: new Date(createQuotationDto.quotation_date),
      quotation_validity: new Date(createQuotationDto.quotation_validity),
      created_by: user_id,
    };

    const quotation_options: Prisma.quotationCreateArgs = {
      data: {
        ...quotation_data,
        quotation_files: {
          createMany: {
            data: evidence,
          },
        },
      },
    };

    const [quotation] = await this.dbService.$transaction([
      this.dbService.quotation.create(quotation_options),
    ]);

    return {
      ...quotation,
    };
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } =
      queryParamsDto;
    const skip = page * take - take;
    const where: Prisma.quotationWhereInput = {
      AND: [
        status ? { status: { id: { in: status } } } : null,
        ...(search
          ? [
              {
                OR: [
                  { order: { vendor: { company_name: { contains: search } } } },
                  { store: { store_name: { contains: search } } },
                  { quotation_number: { contains: search } },
                ],
              },
            ]
          : []),
        date_from && date_to
          ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
          : null,
      ].filter((condition) => Boolean(condition)),
      deleted_at: null,
    };
    const quotation = await this.dbService.quotation.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        quotation_files: true,
        order: {
          include: {
            m_order_details: true,
            vendor: true,
            members: true,
            work_orders: true,
          },
        },
        status: true,
        store: true,
      },
    });

    return {
      data: quotation,
      skip,
      take,
      page,
      total: quotation.length,
    };
  }

  async findOne(id: number) {
    const quotation = await this.dbService.quotation.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        quotation_files: true,
        order: {
          include: {
            m_order_details: true,
            members: true,
            vendor: true,
            work_orders: true,
          },
        },
        status: true,
        store: true,
      },
    });

    return quotation;
  }

  //TODO: FILE UPLOAD -> DONE
  // TODOL SYNC WITH TABLE NEEDS -> DONE
  async update(
    id: number,
    updateQuotationDto: UpdateQuotationDto,
    user: users,
    quotation_files: Express.Multer.File[],
  ) {
    const { id: user_id } = user;
    await this.dbService.quotation_files.deleteMany({
      where: {
        quotation_id: id,
      },
    });

    const evidence = quotation_files.map((item) => ({
      path: item.filename,
      created_by: user_id,
    }));

    const orderConn = updateQuotationDto.order_id
      ? {
          connect: {
            id: updateQuotationDto.order_id,
          },
        }
      : undefined;

    const storeConn = updateQuotationDto.store_id
      ? {
          connect: {
            id: updateQuotationDto.store_id,
          },
        }
      : undefined;

    const statusConn = updateQuotationDto.quotation_status
      ? {
          connect: {
            id: updateQuotationDto.quotation_status,
          },
        }
      : undefined;

    const quotation_data: Prisma.quotationUpdateInput = Object.fromEntries(
      Object.entries({
        order: orderConn,
        store: storeConn,
        status: statusConn,
        description: updateQuotationDto.description ?? undefined,
        quotation_number: updateQuotationDto.quotation_number ?? undefined,
        quotation_date: updateQuotationDto.quotation_date
          ? new Date(updateQuotationDto.quotation_date)
          : undefined,
        quotation_validity: updateQuotationDto.quotation_validity
          ? new Date(updateQuotationDto.quotation_validity)
          : undefined,
        updated_by: user_id,
        quotation_files: quotation_files.length
          ? {
              createMany: {
                data: evidence,
              },
            }
          : undefined,
      }).filter(([key, value]) => value != undefined),
    );

    const [quotation] = await this.dbService.$transaction([
      this.dbService.quotation.update({
        where: {
          id,
        },
        data: quotation_data,
      }),
    ]);

    return quotation;
  }

  async remove(id: number, user_id: number) {
    const quotation = await this.dbService.quotation.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });
  }

  async getCode() {
    const complaints = await this.dbService.complaints.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return complaints[0] || null;
  }
}
