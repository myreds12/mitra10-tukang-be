import { Injectable, HttpStatus, HttpException, BadRequestException } from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, roles, sales, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { hash, hashSync } from 'bcrypt';
import { AuthService } from 'src/auth/auth.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SalesService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async getCode() {
    try {
      const sales = await this.dbService.sales.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return sales[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async create(createSalesDto: CreateSalesDto, user: users) {
    try {
      const { id: user_id } = user;
      let bank = null;
      if (createSalesDto.bank_id) {
        bank = await this.dbService.bank.findFirst({
          where: {
            id: createSalesDto.bank_id,
          },
        });

        if (bank.is_active == false)
          throw new HttpException(
            'Bank is not available',
            HttpStatus.BAD_REQUEST,
          );
      }

      const store = await this.dbService.store.findFirst({
        where: {
          id: createSalesDto.store_id,
        },
      });

      const SALES_ROLES = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });

      let sales_categories: Prisma.sales_categoriesCreateManyInput[];

      if (createSalesDto.sales_categories?.length > 0)
        sales_categories = createSalesDto.sales_categories.map((item) => {
          return {
            category_id: item.category_id,
            commission: item.commission ?? '0',
            created_by: user_id,
          };
        });

      const saltedPassword = hashSync(
        createSalesDto?.password ?? 'password',
        12,
      );

      const formattedUsername =  createSalesDto?.username.replace(/ /g, '_') ?? null;

      if(formattedUsername.length > 20){
        throw new BadRequestException('Username tidak boleh lebih dari 20 karakter.');
      }

      const sales_data: Prisma.salesCreateInput = {
        full_name: createSalesDto.full_name,
        bank_branch: createSalesDto?.bank_branch,
        account_name: createSalesDto?.account_name,
        phone_number: createSalesDto?.phone_number,
        account_number: createSalesDto?.account_number,
        sales_brand: createSalesDto?.sales_brand,
        created_by: user_id,
        nik: createSalesDto?.nik,
        store: {
          connect: {
            id: createSalesDto?.store_id ?? undefined,
          },
        },
        bank: bank
          ? {
              connect: {
                id: createSalesDto.bank_id,
              },
            }
          : undefined,
        sales_categories: sales_categories?.length
          ? {
              createMany: {
                data: sales_categories,
              },
            }
          : undefined,
        users: {
          connectOrCreate: {
            where: {
              username:
              formattedUsername ??
                `${createSalesDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              id: 0,
            },
            create: {
              username:
               formattedUsername ??
                `${createSalesDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              password: saltedPassword,
              role_id: SALES_ROLES.id,
            },
          },
        },
      };

      const [sales] = await this.dbService.$transaction([
        this.dbService.sales.create({
          data: { ...sales_data },
          include: {
            users: true,
          },
        }),
      ]);
      this.emailQueue.add(
        'send-credential-mail',
        {
          username: sales?.users.username,
          password: createSalesDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        search,
        take,
        page,
        date_from,
        date_to,
        order_by,
        top_best,
        store_id,
      } = query;

      const skip = page * take - take;
      const where: Prisma.salesWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    { full_name: { contains: search } },
                    { sales_brand: { contains: search } },
                    { account_name: { contains: search } },
                    { phone_number: { contains: search } },
                    { account_number: { contains: search } },
                    { nik: { contains: search } },
                    { bank_branch: { contains: search } },
                    {
                      sales_categories: {
                        some: {
                          categories: { category_name: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  store_id: {
                    in: store_id,
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.sales.count({
        where,
      });

      const getTake = () => {
        if (take <= 0 && !store_id) {
          return 100;
        }
        return take;
      };

      const sales = await this.dbService.sales.findMany({
        where,
        skip,
        take: getTake(),
        orderBy: {
          ...(Boolean(top_best)
            ? {
                order_total: 'desc',
              }
            : {
                created_at: order_by,
              }),
        },
        include: {
          bank: true,
          store: true,
          sales_brands: {
            include: {
              brands: true,
            },
          },
          sales_categories: {
            include: {
              categories: true,
            },
          },
          users: true,
        },
      });

      return {
        data: sales,
        meta: {
          total: count,
          page,
          take: getTake(),
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const sales = await this.dbService.sales.findFirst({
        where: {
          id,
        },
        include: {
          bank: true,
          store: true,
          sales_brands: {
            include: {
              brands: true,
            },
          },
          sales_categories: {
            include: {
              categories: true,
            },
          },
          users: true,
        },
      });

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateSalesDto: UpdateSalesDto, user: users) {
    try {
      const { id: user_id } = user;
      const sales = await this.dbService.sales.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          store: true,
        },
      });

      if (!sales) {
        throw new HttpException('Sales not found', HttpStatus.NOT_FOUND);
      }

      const SALES_ROLES: roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });

      const upsertSalesCategories: Prisma.sales_categoriesUpsertWithWhereUniqueWithoutSalesInput[] =
        updateSalesDto.sales_categories
          ? updateSalesDto.sales_categories.map(
              ({ id, category_id, commission }) => ({
                where: {
                  id: id ?? 0,
                  category_id,
                },
                update: {
                  category_id,
                  commission,
                  updated_at: new Date(),
                  updated_by: user_id,
                },
                create: {
                  category_id,
                  commission,
                  created_at: new Date(),
                  created_by: user_id,
                },
              }),
            )
          : undefined;

      const salesUsername = updateSalesDto.full_name
        ? `${updateSalesDto.full_name
            .toLowerCase()
            .replace(/ /g, '_')}_${sales.store.store_name
            .toLowerCase()
            .replace(/ /g, '_')}`
        : sales?.users?.username;
      const salesPassword = updateSalesDto.password
        ? await hash(updateSalesDto.password, 12)
        : sales?.users?.password ? sales.users.password : await hash('password', 12);
        let usersConnectOrCreate:
        | Prisma.usersCreateNestedOneWithoutSalesInput
        | undefined;

      if (updateSalesDto?.password) {
        usersConnectOrCreate = {
          connectOrCreate: {
            where: {
              id: sales?.user_id ?? 0,
            },
            create: {
              username: updateSalesDto?.username
                ? updateSalesDto.username
                : salesUsername,
              password: salesPassword,
              created_by: user_id,
              created_at: new Date(),
              role_id: SALES_ROLES.id,
            },
          },
        };
      }
      const salesData: Prisma.salesUpdateInput = {
        // ...(usersConnectOrCreate ? { users: usersConnectOrCreate } : {}),
        ...(sales.users
          ? {
              users: {
                update: {
                  where: {
                    id: sales?.user_id,
                  },
                  data: {
                    username: updateSalesDto?.username ?? salesUsername,
                    password: salesPassword,
                    updated_at: new Date(),
                    updated_by: user_id,
                  },
                },
              },
            }
          : {
            users: {
              create: {
                username: updateSalesDto?.username
                ? updateSalesDto.username
                : salesUsername,
              password: salesPassword,
              created_by: user_id,
              created_at: new Date(),
              role_id: SALES_ROLES.id,
              }
            }
            }),
        ...(updateSalesDto.bank_id
          ? {
              bank: {
                connect: {
                  id: updateSalesDto.bank_id,
                },
              },
            }
          : undefined),
        ...(updateSalesDto.store_id
          ? {
              store: {
                connect: {
                  id: updateSalesDto.store_id,
                },
              },
            }
          : undefined),
        account_name: updateSalesDto.account_name,
        account_number: updateSalesDto.account_number,
        phone_number: updateSalesDto.phone_number,
        bank_branch: updateSalesDto.bank_branch,
        full_name: updateSalesDto.full_name,
        nik: updateSalesDto.nik,
        sales_brand: updateSalesDto.sales_brand,
        sales_categories: {
          upsert: upsertSalesCategories,
        },
        updated_at: new Date(),
        updated_by: user_id,
      };

      const updatedSales = await this.dbService.$transaction([
        this.dbService.sales.update({
          where: {
            id,
          },
          data: salesData,
          include: {
            users: true,
          },
        }),
        ...(updateSalesDto.sales_categories
          ? [
              this.dbService.sales_categories.updateMany({
                where: {
                  sales_id: id,
                  id: {
                    notIn: updateSalesDto.sales_categories.map(
                      ({ category_id }) => category_id,
                    ),
                  },
                },
                data: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              }),
            ]
          : []),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: salesUsername,
          password: updateSalesDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return updatedSales[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async salesUser(store_id: number) {
    try {
      const sales = await this.dbService.sales.findMany({
        take: 10,
        where: {
          store_id,
          user_id: null,
          deleted_at: null,
        },
        include: {
          users: true,
          store: true,
        },
      });
      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });
      const userSales = [];
      await Promise.all(
        sales.map(async (sale) => {
          const { full_name, store_id, id, store } = sale;
          const storeSnakeCase = store.store_name
            .toLowerCase()
            .replace(/\s+/g, '_');
          const fullNameSnakeCase = full_name
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/\W/g, '');

          // lowerCase, snake_case, remove special characters
          const username = `${fullNameSnakeCase.replace(
            /_(\w)_/g,
            '_$1',
          )}_${storeSnakeCase.replace(/_(\w)_/g, '_$1')}`;
          const password = hashSync('password', 12);
          const role_id = roles.id;

          userSales.push({ username, password, role_id });

          const user = await this.dbService.users.create({
            data: {
              username,
              password,
              role_id,
            },
          });

          await this.dbService.sales.update({
            where: {
              id,
              store_id,
            },
            data: {
              user_id: user.id,
            },
          });

          return sale;
        }),
      );

      return userSales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const sales = await this.dbService.sales.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user.id,
          is_active: false,
        },
      });

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async generateSalesCommission(id?: number, quotationId?: number) {}

  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    try {
      const { status, store_id, date_from, date_to } = query;
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Template Sales Commission', {
        properties: {
          tabColor: { argb: 'FF4CAF50' },
          outlineLevelCol: 6,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      // Mendefinisikan kolom-kolom header
      worksheet.columns = [
        { header: 'Order Id', key: 'order_id', width: 20 },
        { header: 'Tanggal Order', key: 'order_create', width: 40 },
        { header: 'Nama Customer', key: 'member_name', width: 40 },
        {
          header: 'Quotation Grand Total',
          key: 'quotation_grand_total',
          width: 35,
        },
        { header: 'Status Order', key: 'order_status', width: 40 },
        { header: 'Sales Id', key: 'sales_id', width: 20 },
        { header: 'Nama Sales', key: 'sales_name', width: 20 },
        { header: 'Bank', key: 'bank_name', width: 30 },
        { header: 'Nama Akun Bank', key: 'account_name', width: 30 },
        { header: 'Nomor Akun Bank', key: 'account_number', width: 30 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Incentive Id', key: 'incentive_id', width: 20 },
        { header: 'Incentive Nominal', key: 'incentive_nominal', width: 35 },
        {
          header: 'Insentif Yang Harus Dibayarkan',
          key: 'received_incentive',
          width: 45,
        },
        { header: 'Status Incentive', key: 'status', width: 25 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      const where: Prisma.sales_incentiveWhereInput = {
        AND: [
          ...(status
            ? [
                {
                  status: {
                    in: status,
                  },
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  sales: {
                    store_id: {
                      in: store_id,
                    },
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      // Mengambil data dari database
      const salesIncentives = await this.dbService.sales_incentive.findMany({
        where,
        include: {
          sales: {
            select: {
              id: true,
              full_name: true,
              account_name: true,
              account_number: true,
              store: {
                select: {
                  store_name: true,
                },
              },
              bank: {
                select: {
                  bank_name: true,
                },
              },
            },
          },
          quotation: {
            select: {
              order_id: true,
              quotation_grand_total: true,
              order: {
                select: {
                  created_at: true,
                  members: {
                    select: {
                      full_name: true,
                    },
                  },
                  status: {
                    select: {
                      category: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
          incentive: true,
        },
      });

      salesIncentives.forEach((incentive, index) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        worksheet.addRow({
          order_id: incentive?.quotation?.order_id ?? '',
          order_create: formattedDateTime(incentive.quotation.order.created_at),
          member_name: incentive?.quotation?.order?.members?.full_name ?? '',
          quotation_grand_total: Number(
            incentive.quotation.quotation_grand_total,
          ),
          order_status: incentive?.quotation?.order?.status?.description ?? '',
          sales_id: incentive.sales_id ?? '',
          sales_name: incentive?.sales?.full_name ?? '',
          bank_name: incentive?.sales?.bank?.bank_name ?? '',
          account_name: incentive.sales?.account_name ?? '',
          account_number: incentive?.sales?.account_number ?? '',
          store_name: incentive?.sales?.store?.store_name ?? '',
          incentive_id: incentive?.incentive_id ?? '',
          incentive_nominal:
            incentive.incentive.type === IncentiveType.NOMINAL
              ? Number(incentive.incentive.incentive)
              : `${incentive.incentive.incentive}%`,
          received_incentive: Number(incentive.nominal),
          status: IncentiveStatus[incentive.status],
          notes: incentive?.notes ?? '',
        });
      });

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/sales';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();
        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res: Response) => {
        const baseName = 'SalesComission';
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      await generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async syncSalesCommission(filePath: string, user: users) {
    try {
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      const salesOrderPairs = [];
      let updatedCount = 0;

      //TODO: SYNC IF NOTES IS IMAGE
      for (
        let rowNumber = 2;
        rowNumber <= worksheet.actualRowCount;
        rowNumber++
      ) {
        const sales_id = worksheet.getCell(`F${rowNumber}`).value as number;
        const order_id = worksheet.getCell(`A${rowNumber}`).value as number;
        const incentive_id = worksheet.getCell(`L${rowNumber}`).value as number;
        const notes = worksheet.getCell(`P${rowNumber}`).value;
        console.log(salesOrderPairs, 'SALES ORDER PAIRS');
        
        if (sales_id && order_id && incentive_id) {
          salesOrderPairs.push({
            sales_id,
            order_id,
            incentive_id,
            notes,
          });
        }
      }

      
      await Promise.all(
        salesOrderPairs.map(async (pair) => {
          const order = await this.dbService.orders.findFirst({
            where: {
              id: pair.order_id,
            },
            include: {
              quotation: true,
            },
          });

          if (!order) {
            console.warn(`Quotation with ID ${pair.order_id} not found.`);
            return;
          }

          const sales = await this.findOne(pair.sales_id);
          if (!sales) {
            console.warn(`Sales with ID ${pair.sales_id} not found.`);
            return;
          }

          const setting_incentive =
            await this.dbService.setting_incentive.findFirst({
              where: {
                id: pair.incentive_id,
              },
            });
          console.log(setting_incentive, 'SETTING INCENTIVE');

          if (!setting_incentive) {
            console.warn(`Incentive with ID ${pair.incentive_id} not found.`);
            return;
          }

          const incentive = await this.dbService.sales_incentive.findFirst({
            where: {
              sales_id: sales.id,
              incentive_id: setting_incentive.id,
              status: IncentiveStatus.PENGAJUAN_INSENTIF,
            },
          });

          if (!incentive) {
            console.warn(`Sales Incentive  not found!`);
            return;
          }

          const updateSales = await this.dbService.sales_incentive.update({
            where: {
              id: incentive.id,
            },
            data: {
              status: IncentiveStatus.PAID,
              notes: pair.notes ?? '',
              updated_at: new Date(),
              updated_by: user.id,
            },
          });
          updatedCount += 1;
        }),
      );
      console.log('SUCCESS');

      return { count: updatedCount };
    } catch (error) {
      console.error('Error synchronizing commission status:', error);
      throw error;
    }
  }

  async salesExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        search,
        take,
        page,
        date_from,
        date_to,
        order_by,
        top_best,
        store_id,
      } = queryParams;
      // const skip = page * take - take;
      const where: Prisma.salesWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    { full_name: { contains: search } },
                    { sales_brand: { contains: search } },
                    {
                      sales_categories: {
                        some: {
                          categories: { category_name: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  store_id: {
                    in: store_id,
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.sales.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);
      console.log(countTake, 'COUNT TAKE');

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;
        console.log(skipData);

        const data = await this.dbService.sales.findMany({
          where,
          skip: skipData,
          take: takeData,
          orderBy: {
            ...(Boolean(top_best)
              ? {
                  order_total: 'desc',
                }
              : {
                  created_at: order_by,
                }),
          },
          include: {
            bank: true,
            store: true,
            sales_brands: {
              include: {
                brands: true,
              },
            },
            sales_categories: {
              include: {
                categories: true,
              },
            },
            users: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.sales.findMany({
          where,
          skip: skipData,
          take: count - dataExcel.length,
          orderBy: {
            ...(Boolean(top_best)
              ? {
                  order_total: 'desc',
                }
              : {
                  created_at: order_by,
                }),
          },
          include: {
            bank: true,
            store: true,
            sales_brands: {
              include: {
                brands: true,
              },
            },
            sales_categories: {
              include: {
                categories: true,
              },
            },
            users: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      console.log(dataExcel.length, 'TAKE DATA'); // Log the total number of records fetched
      console.log(count, 'COUNT');

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Profile Sales ', {
        properties: {
          tabColor: {
            argb: 'FF4CAF50',
          },
          outlineLevelCol: 6,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Sales Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Sales', key: 'full_name', width: 35 },
        { header: 'Nama Bank', key: 'bank_name', width: 35 },
        { header: 'Nama Akun Bank', key: 'account_name', width: 35 },
        { header: 'Nomor Akun Bank', key: 'number_account', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Nama Brand', key: 'sales_brand', width: 35 },
        { header: 'Order Total', key: 'order_total', width: 25 },
        { header: 'Sales Category', key: 'sales_categories', width: 50 },
        { header: 'Username Sales', key: 'username', width: 40 },
        { header: 'Sales Dibuat', key: 'created_at', width: 35 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      dataExcel.forEach((sales) => {
        const salesCategories = sales.sales_categories
          ? sales.sales_categories
              .map((category) => category.categories.category_name)
              .join(',')
          : '';
        const dateTime = new Date(sales.created_at);
        const formattedDateTime = `${dateTime.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${dateTime.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
        const row = worksheet.addRow({
          id: sales.id,
          store_name: sales.store ? sales.store.store_name : '',
          full_name: sales.full_name ? sales.full_name : '',
          bank_name: sales.bank ? sales.bank.bank_name : '',
          account_name: sales.account_name ? sales.account_name : '',
          number_account: sales.account_number ? sales.account_number : '',
          phone_number: sales.phone_number ? sales.phone_number : '',
          sales_brand: sales.sales_brand ? sales.sales_brand : '',
          order_total: sales.order_total ? sales.order_total : '',
          sales_categories: salesCategories,
          username: sales.users ? sales.users.username : '',
          created_at: formattedDateTime,
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/sales';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook,
        excelFilePath,
        res,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (data, res) => {
        const baseName = `DataSales`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(dataExcel, res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async deleteOrder() {
    try {

     const salesIncentive = await this.dbService.sales_incentive.updateMany({
      where: {
        quotation: {
          order: {
            status: {
              category: 'WORKEND'
            }
          }
        }
      },
      data: {
        status: 2
      }
     });

     return salesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  @Cron(CronExpression.EVERY_2ND_MONTH)
  async salesUserManagement() {
    try {

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
     const salesIncentive = await this.dbService.sales.updateMany({
      where: {
          orders: {
            some: {
              created_at: {
                lt: twoMonthsAgo
              }
            }
          }        
      },
      data: {
        is_active: false,
      }
     });

     const users = await this.dbService.users.updateMany({
      where: {
          sales: {
            some: {
              created_at: {
                lt: twoMonthsAgo
              }
            }
          }        
      },
      data: {
        is_active: false,
      }
     });

     return salesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_6_MONTHS)
  async managementSalesSixMonth() {
    try {

      const sixMonthAgo = new Date();
      sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6);
     const salesIncentive = await this.dbService.sales.updateMany({
      where: {
          orders: {
            some: {
              created_at: {
                lt: sixMonthAgo
              }
            }
          }        
      },
      data: {
        is_active: false,
        deleted_at: new Date()
      }
     });

     const users = await this.dbService.users.updateMany({
      where: {
          sales: {
            some: {
              created_at: {
                lt: sixMonthAgo
              }
            }
          }        
      },
      data: {
        is_active: false,
        deleted_at: new Date()
      }
     });

     return salesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
