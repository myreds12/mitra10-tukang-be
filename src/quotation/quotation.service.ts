import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MarginType } from './dto/margin-type.enum';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QuotationService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  private readonly logger = new Logger(QuotationService.name);

  async create(
    createQuotationDto: CreateQuotationDto,
    user: users,
    quotation_files?: Express.Multer.File[],
  ) {
    console.log(createQuotationDto);

    const { id: user_id } = user;
    let grandTotal = 0;
    let comission;

    const evidence: Array<Prisma.quotation_filesCreateManyQuotationInput> =
      quotation_files
        ? quotation_files.map((item) => ({
            path: item.filename,
            created_by: user_id,
          }))
        : undefined;

    const statusForEmail = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'QUOTEOUT',
        },
      },
    });

    const quotaionDetails: Array<Prisma.quotation_detailsCreateManyQuotationInput> =
      createQuotationDto.quotation_details.map((item) => {
        const prices = Number(item.is_customer ? 0 : item?.price ?? 0);
        const quantity = item.is_customer ? 0 : item.quantity;
        const margin =
          item.margin_type === MarginType.PERCENTAGE
            ? +item.margin >= 1 && +item.margin <= 100
              ? prices * quantity * (+item.margin / 100)
              : 0
            : +item.margin;
        const final_price = prices * quantity + margin;
        console.log(
          prices,
          'Prices',
          quantity,
          'Quantity',
          final_price,
          'Final Price',
          margin,
        );

        grandTotal += final_price ?? 0;
        return {
          category_id: item?.category_id,
          item_id: item?.item_id,
          item_type: item.type,
          margin: item.margin,
          margin_type: item.margin_type,
          description: item?.description,
          name: item.name,
          price: prices,
          unit: item.unit,
          quantity: quantity,
          work_order_items_id: item?.work_order_item_id,
          is_customer: Boolean(item.is_customer),
          final_price: final_price ?? 0,
        };
      });
    if (grandTotal >= 500000) comission = (grandTotal * 2.5) / 100;

    console.log(quotaionDetails, 'QUOTATION DETAILS');

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
      quotation_disc: createQuotationDto?.quotation_disc,
      quotation_promotion: createQuotationDto?.quotation_promotion,
      quotation_grand_total:
        grandTotal -
        (createQuotationDto.quotation_disc
          ? +createQuotationDto.quotation_disc
          : 0 + createQuotationDto.quotation_promotion
          ? +createQuotationDto.quotation_promotion
          : 0),
      created_by: user_id,
    };

    console.log(createQuotationDto, 'DTOOO');
    console.log(quotation_data, 'QUOT DAT');
    console.log(quotaionDetails, 'DETAILSS');
    console.log(grandTotal, 'GRAND TOTAL');

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

    console.log(comission);

    const [quotation, order] = await this.dbService.$transaction([
      this.dbService.quotation.create(quotation_options),
      this.dbService.orders.update({
        where: {
          id: createQuotationDto.order_id,
        },
        data: {
          grand_total_comission: comission ?? undefined,
        },
      }),
    ]);

    await this.orderService.setStatus(
      quotation.order_id,
      quotation.quotation_status,
      user,
    );

    if (quotation.quotation_status === statusForEmail.id) {
      await this.emailQueue.add(
        'send-quotation-mail',
        { id: quotation.id },
        {
          attempts: 3,
        },
      );
    }
    return { quotation, sales_comission: comission ?? 0 };
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
      orderBy: {
        created_at: order_by,
      },
      include: {
        quotation_files: true,
        quotation_details: {
          include: {
            category: true,
          },
        },
        order: {
          include: {
            m_order_details: true,
            vendor: true,
            store: true,
            members: true,
            work_orders: {
              include: {
                work_order_evidences: true,
                work_order_status: {
                  include: {
                    work_order_items: {
                      orderBy: {
                        id: 'desc',
                      },
                    },
                  },
                },
                work_order_tukang: true,
                status: true,
              },
            },
          },
        },
        status: true,
        store: true,
      },
    });

    const quotationGrandTotal = await this.dbService.quotation
      .aggregate({
        _sum: {
          quotation_grand_total: true,
        },
      })
      .then((data) => data._sum.quotation_grand_total);
    const total = await this.dbService.quotation.count();
    return {
      data: quotation,
      skip,
      take,
      page,
      takeTotal: quotation.length,
      quotationGrandTotal,
      total,
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
        quotation_details: {
          include: {
            category: true,
          },
        },
        order: {
          include: {
            m_order_details: true,
            members: true,
            vendor: true,
            work_orders: {
              include: {
                work_order_evidences: true,
                work_order_status: {
                  orderBy: {
                    id: 'desc',
                  },
                  include: {
                    work_order_items: {
                      orderBy: {
                        id: 'desc',
                      },
                    },
                  },
                },
                work_order_tukang: true,
                status: true,
              },
            },
          },
        },
        status: true,
        store: true,
      },
    });

    return quotation;
  }

  async update(
    id: number,
    updateQuotationDto: UpdateQuotationDto,
    user: users,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    const { id: user_id } = user;
    const { quotation_files, quotation_receipts } = files;

    const STATUS_QUOTEOUT = await this.dbService.status.findFirst({
      where: {
        category: {
          contains: 'QUOTEOUT',
        },
      },
    });

    const quotationfiles =
      quotation_files?.map((item) => ({
        path: item.filename,
        type: 1,
        created_by: user_id,
      })) ?? [];

    const receiptfile =
      quotation_receipts?.map((file) => ({
        path: file.filename,
        type: 2,
        created_by: user_id,
      })) ?? [];

    const evidence = [].concat(quotationfiles, receiptfile);

    let grandTotal = 0;
    const quotationDetailsUpsert: Prisma.quotation_detailsUpsertWithWhereUniqueWithoutQuotationInput[] =
      updateQuotationDto.quotation_details.map((item) => {
        let price: number = 0;
        let quantity: number = 0;
        let final_price: number = 0;

        if (!item.is_customer) {
          price = Number(item.price);
          quantity = Number(item.quantity);

          final_price = Number(
            price * quantity +
              (item.margin_type === MarginType.PERCENTAGE
                ? price * quantity * (+item.margin / 100)
                : +item.margin),
          );
        }

        grandTotal += final_price;
        return {
          where: {
            quotation_id: id,
            id: item?.id ?? 0,
          },
          update: {
            category_id: item?.category_id,
            item_id: item?.item_id,
            item_type: item?.type,
            description: item?.description,
            name: item?.name,
            price,
            unit: item.unit,
            quantity,
            margin: item?.margin,
            margin_type: item?.margin_type,
            final_price,
            work_order_items_id: item?.work_order_item_id,
            is_customer: Boolean(item.is_customer),
            updated_at: new Date(),
            updated_by: user_id,
          },
          create: {
            category_id: item?.category_id,
            item_id: item?.item_id,
            item_type: item?.type,
            description: item?.description,
            name: item?.name,
            unit: item.unit,
            price: item?.price,
            quantity: item?.quantity,
            margin: item?.margin,
            margin_type: item?.margin_type,
            work_order_items_id: item?.work_order_item_id,
            is_customer: Boolean(item.is_customer),
            final_price,
            created_by: user_id,
          },
        };
      });

    const [syncDetails, quotation] = await this.dbService.$transaction([
      this.dbService.quotation_details.updateMany({
        where: {
          quotation_id: id,
          id: {
            notIn: updateQuotationDto.quotation_details
              .filter((x) => Boolean(x?.id))
              .map((item) => {
                return item.id;
              }),
          },
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      }),
      this.dbService.quotation.update({
        where: {
          id,
        },
        data: {
          status: updateQuotationDto?.quotation_status
            ? {
                connect: {
                  id: updateQuotationDto.quotation_status,
                },
              }
            : undefined,
          description: updateQuotationDto?.description ?? undefined,
          readiness: updateQuotationDto?.readiness ?? undefined,
          quotation_number: updateQuotationDto?.quotation_number ?? undefined,

          quotation_date: updateQuotationDto?.quotation_date
            ? new Date(updateQuotationDto?.quotation_date)
            : undefined,
          quotation_validity: updateQuotationDto?.quotation_validity
            ? new Date(updateQuotationDto?.quotation_validity)
            : undefined,
          quotation_disc: updateQuotationDto?.quotation_disc,
          quotation_promotion: updateQuotationDto?.quotation_promotion,
          quotation_grand_total:
            grandTotal -
            (updateQuotationDto.quotation_disc
              ? +updateQuotationDto.quotation_disc
              : 0 + updateQuotationDto.quotation_promotion
              ? +updateQuotationDto.quotation_promotion
              : 0),
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

    if (
      updateQuotationDto.readiness === 2 &&
      STATUS_QUOTEOUT.id === quotation.quotation_status
    ) {
      await this.emailQueue.add(
        'send-quotation-mail',
        { id: quotation.id },
        {
          attempts: 3,
        },
      );
    }

    this.orderService.setStatus(
      quotation.order_id,
      quotation.quotation_status,
      user,
    );

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
    const quotation = await this.dbService.quotation.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return quotation[0] || null;
  }

  async setStatus(id: number, status_id: number, user: users) {
    const { id: user_id } = user;
    const status = await this.dbService.status.findFirst({
      where: {
        id: status_id,
        category: {
          in: ['quotein', 'quoteout'],
        },
      },
    });
    if (!status) throw new BadRequestException('Status Id not found!');

    const quotationFind = await this.dbService.quotation.findFirst({
      where: {
        id,
      },
      include: {
        status: true,
      },
    });

    if (!quotationFind) throw new BadRequestException('Quotation not found!');
    if (quotationFind.status.category.toLowerCase().includes('quoteout'))
      throw new BadRequestException('Cannot change status!');

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

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncQuotationMail() {
    this.logger.verbose('Initiate syncQuotationMail');

    // TODO: SEARCH QUOTATION WHERE READINESS 2 AND QUOTATION STATUS QUOTEOUT
    const quotations = await this.dbService.quotation.findMany({
      where: {
        status: {
          category: {
            contains: 'QUOTEOUT',
          },
        },
        readiness: 2,
      },
      take: 10,
    });

    if (quotations.length === 0) {
      this.logger.verbose('No pending quotation to send');
      return 0;
    }

    this.logger.verbose(`${quotations.length} pending quotations found`);
    await Promise.all(
      quotations.map(async (quotation) => {
        const { id } = quotation;
        this.logger.verbose(`${quotations.length} pending quotations found`);

        // TODO: TRIGGER SEND EMAIL
        await this.emailQueue.add('send-quotation-mail', { id });

        // TODO: CHANGE CURRENT QUOTATION STATUS TO READINESS 4
        await this.dbService.quotation.update({
          where: {
            id,
          },
          data: {
            readiness: 4,
          },
        });
      }),
    );

    this.logger.verbose('Finished syncQuotationMail');

    return quotations.length;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkvalidity() {
    this.logger.log('init checkvalidity');
    const quotations = await this.dbService.quotation.findMany({
      where: {
        status: {
          category: {
            contains: 'QUOTEOUT',
          },
        },
        quotation_validity: {
          lte: new Date(),
        },
      },
    });

    if (!quotations.length) {
      this.logger.log('No quotation found');
      return 0;
    }

    this.logger.log(`${quotations.length} quotation found`);

    const NEWSTATUS = await this.dbService.status.findFirst({
      where: {
        category: {
          in: ['CLOSED', 'UNPAID'],
        },
      },
    });

    await Promise.all(
      quotations.map(async (quotation) => {
        const { id } = quotation;
        await this.dbService.quotation.update({
          where: {
            id,
          },
          data: {
            quotation_status: NEWSTATUS.id,
          },
        });
      }),
    );

    return 1;
  }
}
