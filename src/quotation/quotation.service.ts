import { BadRequestException, Injectable } from '@nestjs/common';
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
    quotation_files?: Express.Multer.File[],
  ) {
    console.log(createQuotationDto);

    const { id: user_id } = user;
    let grandTotal = 0;

    const evidence: Array<Prisma.quotation_filesCreateManyQuotationInput> =
      quotation_files
        ? quotation_files.map((item) => ({
            path: item.filename,
            created_by: user_id,
          }))
        : undefined;

    const quotaionDetails: Array<Prisma.quotation_detailsCreateManyQuotationInput> =
      createQuotationDto.quotation_details.map((item) => {
        const final_price = +item.price * item.quantity + +item.margin;
        grandTotal += final_price;
        return {
          item_id: item?.item_id,
          item_type: item.type,
          margin: item.margin,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          final_price,
        };
      });

    const status = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'QUOTEIN',
        },
      },
    });

    const quotation_data: Prisma.quotationCreateInput = {
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
          id: status.id,
        },
      },
      description: createQuotationDto.description,
      quotation_number: createQuotationDto.quotation_number,
      quotation_date: new Date(createQuotationDto.quotation_date),
      quotation_validity: new Date(createQuotationDto.quotation_validity),
      quotation_disc: createQuotationDto.quotation_disc,
      quotation_grand_total: grandTotal - +createQuotationDto.quotation_disc,
      created_by: user_id,
    };

    console.log(quotation_data);

    const quotation_options: Prisma.quotationCreateArgs = {
      data: {
        ...quotation_data,
        quotation_files: {
          createMany: {
            data: evidence,
          },
        },
        quotation_details: {
          createMany: {
            data: quotaionDetails,
          },
        },
      },
    };

    const [quotation] = await this.dbService.$transaction([
      this.dbService.quotation.create(quotation_options),
    ]);
    return quotation;
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

    // const quotationDetailsUpsert : Prisma.quotation_detailsUpsertWithWhereUniqueWithoutQuotationInput[] =

    const evidence = quotation_files.map((item) => ({
      path: item.filename,
      created_by: user_id,
    }));

    let grandTotal = 0;
    const quotationDetailsUpsert: Prisma.quotation_detailsUpsertWithWhereUniqueWithoutQuotationInput[] =
      updateQuotationDto.quotation_details.map((item) => {
        const final_price = +item.price * item.quantity + +item.margin;
        grandTotal += final_price;
        return {
          where: {
            quotation_id: id,
            id: item?.id ?? 0,
          },
          update: {
            item_id: item?.item_id,
            item_type: item?.type,
            name: item?.name,
            price: item?.price,
            quantity: item?.quantity,
            margin: item?.margin,
            final_price,
            updated_at: new Date(),
            updated_by: user_id,
          },
          create: {
            item_id: item?.item_id,
            item_type: item?.type,
            name: item?.name,
            price: item?.price,
            quantity: item?.quantity,
            margin: item?.margin,
            final_price,
            created_by: user_id,
          },
        };
      });

    const quotation_data: Prisma.quotationUpdateInput = Object.fromEntries(
      Object.entries({
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

    const [syncQuotationFiles, quotation] = await this.dbService.$transaction([
      this.dbService.quotation_files.deleteMany({
        where: {
          quotation_id: id,
        },
      }),
      this.dbService.quotation.update({
        where: {
          id,
        },
        data: {
          description: updateQuotationDto?.description ?? undefined,
          quotation_number: updateQuotationDto?.quotation_number ?? undefined,
          quotation_date: updateQuotationDto?.quotation_date
            ? new Date(updateQuotationDto?.quotation_date)
            : undefined,
          quotation_validity: updateQuotationDto?.quotation_validity
            ? new Date(updateQuotationDto?.quotation_validity)
            : undefined,
          updated_by: user_id,
          updated_at: new Date(),
          quotation_files: quotation_files.length
            ? {
                createMany: {
                  data: evidence,
                },
              }
            : undefined,
          quotation_details: {
            upsert: quotationDetailsUpsert,
          },
        },
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

  async setStatus(
    id: number,
    status_id: number,
    user: users,
  ) {
    const {id: user_id} = user;
    const status = await this.dbService.status.findFirst({
      where:{
        id: status_id,
        category: {
          in: ["quotein", "quoteout"]
        }
      }
    });
    if(!status) throw new BadRequestException("Status Id not found!");

    const quotationFind = await this.dbService.quotation.findFirst({
      where: {
        id,
      },
      include: {
        status: true
      }
    })

    if(!quotationFind) throw new BadRequestException("Quotation not found!");
    if(quotationFind.status.category.toLowerCase().includes("quoteout")) throw new BadRequestException("Cannot change status!");

    const quotation = await this.dbService.quotation.update({
      where: {
        id,
      },
      data: {
        quotation_status: status.id,
        updated_at: new Date(),
        updated_by: user_id,
      },
    });

    return quotation;
  }
}
