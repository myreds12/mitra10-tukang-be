/* eslint-disable prettier/prettier */
import {
  Injectable,
  HttpStatus,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, roles, users } from '@prisma/client';
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
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class ManagerService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async getCode() {
    try {
      const manager = await this.dbService.manager.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return manager[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async createInsetiveManager(createManagerDto: any, user: users) {
    try {
      // const { id: user_id } = user;
      const [sales] = await this.dbService.$transaction([
        this.dbService.manager_incentive.create({
          data: {
            incentive: {
              connect: { id: createManagerDto.incentive_id },
            },
            manager: {
              connect: { id: createManagerDto.manager_id },
            },
            nominal: new Prisma.Decimal(createManagerDto.nominal), // Pastikan ini string/Decimal, bukan number mentah
            status: createManagerDto.status ?? 0,
            notes: createManagerDto.notes ?? '',
            created_by: user.id,
          },
        }),
      ]);

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getInsentive(query: QueryParamsDto) {
    try {
      const { take, page, date_from, date_to } = query;

      const skip = page * take - take;
      const where: Prisma.manager_incentiveWhereInput = {
        AND: [
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

      const count = await this.dbService.manager_incentive.count({
        where,
      });

      const getTake = () => {
        if (take <= 0) {
          return 100;
        }
        return take;
      };

      const sales = await this.dbService.manager_incentive.findMany({
        where,
        skip,
        take: getTake(),
      });

      const dataSales = sales.map((item) => {
        return {
          ...item,
        };
      });

      return {
        data: dataSales,
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

  async create(createManagerDto: CreateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      console.log(user_id);
      console.log(createSalesDto);
      let bank = null;

      if (createManagerDto.bank_id) {
        bank = await this.dbService.bank.findFirst({
          where: {
            id: createManagerDto.bank_id,
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
          id: createManagerDto.store_id,
        },
      });

      const MANAGER_ROLES = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'Manager Store',
          },
        },
      });
 
      // Deactivate other managers at this store
      await this.dbService.manager.updateMany({
        where: {
          store_id: createManagerDto.store_id,
          is_active: true,
        },
        data: {
          is_active: false,
        },
      });

      const saltedPassword = hashSync(
        createManagerDto?.password ?? 'password',
        12,
      );

      const formattedUsername =
        createManagerDto?.username?.replace(/ /g, '_') ?? null;

      const manager_data: Prisma.managerCreateInput = {
        full_name: createManagerDto.full_name,
        account_name: createManagerDto?.account_name,
        phone_number: createManagerDto?.phone_number,
        account_number: createManagerDto?.account_number,
        created_by: user_id,
        nik: createManagerDto?.nik,
        store: {
          connect: {
            id: createManagerDto?.store_id ?? undefined,
          },
        },
        bank: bank
          ? {
              connect: {
                id: createManagerDto.bank_id,
              },
            }
          : undefined,
        users: {
          connectOrCreate: {
            where: {
              username:
                formattedUsername ??
                `${createManagerDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              id: 0,
            },
            create: {
              username:
                formattedUsername ??
                `${createManagerDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              password: saltedPassword,
              role_id: MANAGER_ROLES.id,
            },
          },
        },

        is_active: true, // Ensure the new manager is active
      };

      const [manager] = await this.dbService.$transaction([
        this.dbService.manager.create({
          data: { ...manager_data },
          include: {
            users: true,
          },
        }),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: manager?.users.username,
          password: createManagerDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { search, take, page, date_from, date_to, store_id } = query;

      const skip = page * take - take;
      const where: Prisma.managerWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    { full_name: { contains: search } },

                    { account_name: { contains: search } },
                    { phone_number: { contains: search } },
                    { account_number: { contains: search } },
                    { nik: { contains: search } },
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

      const count = await this.dbService.manager.count({
        where,
      });

      const getTake = () => {
        if (take <= 0 && !store_id) {
          return 100;
        }
        return take;
      };

      const manager = await this.dbService.manager.findMany({
        where,
        skip,
        take: getTake(),
        include: {
          bank: true,
          store: true,
          users: true,
        },
      });

      const dataManager = manager.map((item) => {
        return {
          ...item,
        };
      });

      return {
        data: dataManager,
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
  async findOneInsetif(id: number) {
    try {

      const incetiveDetail = await this.dbService.manager_incentive.findFirst({
        where:{
          id: id
        }
      })
      // console.log(incetiveDetail);
      
      const sales = await this.dbService.manager.findFirst({
        where: {
          id: incetiveDetail.manager_id,
        },
        include: {
          bank: true,
          store: true,
      
          users: true,
        },
      });
      const data ={
        ...incetiveDetail,
        ...sales
      }
      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async findOne(id: number) {
    try {
      const manager = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          bank: true,
          store: true,
          users: true,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateManagerDto: UpdateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      const manager = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          store: true,
        },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found');
      }

      const MANAGER_ROLES: roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'Manager Store',
          },
        },
      });

      // Check if we're activating this manager
      if (updateManagerDto.is_active === 1) {
        // Deactivate other managers at this store
        await this.dbService.manager.updateMany({
          where: {
            store_id: updateManagerDto.store_id || manager.store_id,
            id: { not: id }, // Exclude the current manager being updated
            is_active: true,
          },
          data: {
            is_active: false,
            updated_at: new Date(),
            updated_by: user_id,
          },
        });
      }

      const managerUsername = updateManagerDto.full_name
        ? `${updateManagerDto.full_name
            .toLowerCase()
            .replace(/ /g, '_')}_${manager.store.store_name
            .toLowerCase()
            .replace(/ /g, '_')}`
        : manager?.users?.username;

      const managerPassword = updateManagerDto.password
        ? await hash(updateManagerDto.password, 12)
        : manager?.users?.password
        ? manager.users.password
        : await hash('password', 12);

      const managerData: Prisma.managerUpdateInput = {
        ...(manager.users &&
        updateManagerDto.username &&
        updateManagerDto.password
          ? {
              users: {
                update: {
                  where: {
                    id: manager?.user_id,
                  },
                  data: {
                    username: updateManagerDto?.username ?? managerUsername,
                    password: managerPassword,
                    updated_at: new Date(),
                    updated_by: user_id,
                  },
                },
              },
            }
          : updateManagerDto.username && updateManagerDto.password
          ? {
              users: {
                create: {
                  username: updateManagerDto?.username
                    ? updateManagerDto.username
                    : managerUsername,
                  password: managerPassword,
                  created_by: user_id,
                  created_at: new Date(),
                  role_id: MANAGER_ROLES.id,
                },
              },
            }
          : undefined),
        ...(updateManagerDto.bank_id
          ? {
              bank: {
                connect: {
                  id: updateManagerDto.bank_id,
                },
              },
            }
          : undefined),
        ...(updateManagerDto.store_id
          ? {
              store: {
                connect: {
                  id: updateManagerDto.store_id,
                },
              },
            }
          : undefined),
        account_name: updateManagerDto.account_name,
        account_number: updateManagerDto.account_number,
        phone_number: updateManagerDto.phone_number,
        full_name: updateManagerDto.full_name,
        nik: updateManagerDto.nik,
        is_active:
          updateManagerDto.is_active !== undefined
            ? Boolean(updateManagerDto.is_active)
            : manager.is_active,
        updated_at: new Date(),
        updated_by: user_id,
      };

      const updatedManager = await this.dbService.$transaction([
        this.dbService.manager.update({
          where: {
            id,
          },
          data: managerData,
          include: {
            users: true,
          },
        }),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: managerUsername,
          password: updateManagerDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return updatedManager[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async managerUser(store_id: number) {
    try {
      const manager = await this.dbService.manager.findMany({
        take: 10,
        where: {
          store_id,
          is_active: true,
        },
        include: {
          users: true,
          store: true,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const manager = await this.dbService.manager.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user.id,
          is_active: false,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    try {
      const { status, store_id, date_from, date_to } = query;
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Template Manager Commission', {
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
        { header: 'Manager Id', key: 'manager_id', width: 20 },
        { header: 'Nama Manager', key: 'manager_name', width: 20 },
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

      salesIncentives.forEach((incentive) => {
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
        const baseName = 'ManagerComission';
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      await generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async syncManagerCommission(filePath: string, user: users) {
    try {
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      const managerOrderPairs = [];
      let updatedCount = 0;

      for (
        let rowNumber = 2;
        rowNumber <= worksheet.actualRowCount;
        rowNumber++
      ) {
        const manager_id = worksheet.getCell(`F${rowNumber}`).value as number;
        const order_id = worksheet.getCell(`A${rowNumber}`).value as number;
        const incentive_id = worksheet.getCell(`L${rowNumber}`).value as number;
        const notes = worksheet.getCell(`P${rowNumber}`).value;

        if (manager_id && order_id && incentive_id) {
          managerOrderPairs.push({
            manager_id,
            order_id,
            incentive_id,
            notes,
          });
        }
      }

      await Promise.all(
        managerOrderPairs.map(async (pair) => {
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

          const manager = await this.findOne(pair.manager_id);
          if (!manager) {
            console.warn(`Manager with ID ${pair.sales_id} not found.`);
            return;
          }

          const setting_incentive =
            await this.dbService.setting_incentive.findFirst({
              where: {
                id: pair.incentive_id,
              },
            });

          if (!setting_incentive) {
            console.warn(`Incentive with ID ${pair.incentive_id} not found.`);
            return;
          }

          const incentive = await this.dbService.manager_incentive.findFirst({
            where: {
              manager_id: manager.id,
              incentive_id: setting_incentive.id,
              status: IncentiveStatus.PENGAJUAN_INSENTIF,
            },
          });

          if (!incentive) {
            console.warn(`Sales Incentive  not found!`);
            return;
          }

          const updateManager = await this.dbService.manager_incentive.update({
            where: {
              id: incentive.id,
            },
            data: {
              status: IncentiveStatus.INSENTIF_DIBAYARKAN,
              notes: pair.notes ?? '',
              updated_at: new Date(),
              updated_by: user.id,
            },
          });
          await this.notifService.create(
            {
              sales_incentive: updateManager,
              orders: order,
            },
            'UPDATE',
            updateManager.updated_by,
            moduleTypeNotification.INCENTIVE,
            updateManager.id,
            updateManager.status,
          );
          updatedCount += 1;
        }),
      );

      return { count: updatedCount };
    } catch (error) {
      console.error('Error synchronizing commission status:', error);
      throw error;
    }
  }

  async managerExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { search, date_from, date_to, store_id } = queryParams;
      // const skip = page * take - take;
      const where: Prisma.managerWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [{ full_name: { contains: search } }],
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

      const count = await this.dbService.manager.count({
        where,
      });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i < countTake; i++) {
        skipData = i * takeData;

        const data = await this.dbService.manager.findMany({
          where,
          skip: skipData,
          take: takeData,

          include: {
            bank: true,
            store: true,

            users: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

      if (count != dataExcel.length) {
        const data = await this.dbService.manager.findMany({
          where,
          skip: skipData,
          take: count - dataExcel.length,

          include: {
            bank: true,
            store: true,

            users: true,
          },
        });
        dataExcel = [...dataExcel, ...data];
      }

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
        { header: 'Manager Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Manager', key: 'full_name', width: 35 },
        { header: 'Nama Bank', key: 'bank_name', width: 35 },
        { header: 'Nama Akun Bank', key: 'account_name', width: 35 },
        { header: 'Nomor Akun Bank', key: 'number_account', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Username Sales', key: 'username', width: 40 },
        { header: 'Manager Dibuat', key: 'created_at', width: 35 },
        { header: 'Status', key: 'is_active', width: 35 },
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
        const formattedDateTime = (dateTime) =>
          `${dateTime.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const currentMonth = new Date();
        const orderDate =
          sales?.orders?.length > 0
            ? new Date(sales.orders[0].created_at)
            : sales.created_at;

        const monthDifference =
          (currentMonth.getFullYear() - orderDate.getFullYear()) * 12 +
          currentMonth.getMonth() -
          orderDate.getMonth();

        const row = worksheet.addRow({
          id: sales.id,
          store_name: sales?.store ? sales.store.store_name : '',
          full_name: sales?.full_name ? sales.full_name : '',
          bank_name: sales?.bank ? sales.bank.bank_name : '',
          account_name: sales?.account_name ? sales.account_name : '',
          number_account: sales?.account_number ? sales.account_number : '',
          phone_number: sales?.phone_number ? sales.phone_number : '',

          username: sales?.users ? sales.users.username : '',
          created_at: formattedDateTime(sales?.created_at),

          date_diff: `${monthDifference} Bulan`,
          is_active: sales?.is_active ? 'Aktif' : 'Tidak Aktif',
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

  // @Cron(CronExpression.EVERY_5_MINUTES)
  // async deleteOrder() {
  //   try {
  //     const updatedManagerIncentives =
  //       await this.dbService.manager_incentive.findMany({
  //         where: {
  //           status: IncentiveStatus.POTENTIAL_INCENTIVE,
  //           quotation: {
  //             order: {
  //               status: {
  //                 category: 'WORKEND',
  //               },
  //             },
  //           },
  //         },
  //         select: {
  //           id: true,
  //           updated_by: true,
  //           status: true,
  //           quotation: {
  //             select: {
  //               order: {
  //                 select: {
  //                   id: true,
  //                   sales_id: true,
  //                   store_id: true,
  //                   vendor_id: true,
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       });

  //     await this.dbService.sales_incentive.updateMany({
  //       where: {
  //         id: { in: updatedManagerIncentives.map((si) => si.id) },
  //       },
  //       data: {
  //         status: 2,
  //         created_at: new Date(),
  //       },
  //     });

  //     await Promise.all(
  //       updatedManagerIncentives.map(async (updateManager) => {
  //         const order = updateManager.quotation.order;

  //         if (order) {
  //           await this.notifService.create(
  //             {
  //               sales_incentive: updateManager,
  //               orders: order,
  //             },
  //             'UPDATE',
  //             updateManager.updated_by,
  //             moduleTypeNotification.INCENTIVE,
  //             updateManager.id,
  //             updateManager.status,
  //           );
  //         }
  //       }),
  //     );

  //     return {
  //       message: `${updatedManagerIncentives.length} sales incentives updated and notifications created successfully.`,
  //     };
  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

  async updateDateManagerIncentive(id: number) {
    try {
      const ManagerIncentive = await this.dbService.sales_incentive.findFirst({
        where: {
          deleted_at: null,
          status: 2,
          id: id,
        },
        include: {
          incentive: true,
          quotation: true,
        },
      });
      const quotationManagerIncentive =
        await this.dbService.quotation.findFirst({
          where: {
            id: ManagerIncentive.quotation_id,
          },
          select: {
            order: {
              select: {
                order_history: {
                  where: {
                    status: {
                      category: 'WORKEND',
                    },
                  },
                  orderBy: {
                    created_at: 'desc',
                  },
                  include: {
                    status: true,
                  },
                },
              },
            },
          },
        });

      let comission = 0;
      if (ManagerIncentive.incentive.type === 1) {
        comission +=
          Number(ManagerIncentive.quotation.quotation_grand_total) *
          (Number(ManagerIncentive.incentive.incentive) / 100);
      } else if (ManagerIncentive.incentive.type === 2) {
        comission += Number(ManagerIncentive.incentive.incentive);
      }

      const updateManagerIncentive =
        await this.dbService.sales_incentive.update({
          where: {
            id: id,
          },
          data: {
            nominal: Math.floor(comission),
            created_at: new Date(
              quotationManagerIncentive.order.order_history[0].created_at,
            ),
          },
        });

      return updateManagerIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async deleteManagerIncentive(id: number) {
    try {
      const deleteManagerIncentive =
        await this.dbService.manager_incentive.delete({
          where: {
            id: id,
          },
        });

      return deleteManagerIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
