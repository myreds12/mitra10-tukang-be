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
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class ManagerService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }

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
  async createInsetivManager(createSalesDto: any, user: users) {
    try {
      // const { id: user_id } = user;
      const [sales] = await this.dbService.$transaction([
        this.dbService.manager_incentive.create({
          data: {
            incentive: {
              connect: { id: createSalesDto.incentive_id },
            },
            manager: {
              connect: { id: createSalesDto.manager_id },
            },
            nominal: new Prisma.Decimal(createSalesDto.nominal), // Pastikan ini string/Decimal, bukan number mentah
            status: createSalesDto.status ?? 0,
            notes: createSalesDto.notes ?? '',
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
      const {
        search,
        take,
        page,
        date_from,
        date_to,
      } = query;

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
        if (take <= 0 ) {
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
        }
      })

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
  async create(createSalesDto: CreateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      console.log(user_id);
      console.log(createSalesDto);
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
            contains: 'Manager Store',
          },
        },
      });
 
      // Deactivate other managers at this store
      await this.dbService.manager.updateMany({
        where: {
          store_id: createSalesDto.store_id,
          is_active: true,
        },
        data: {
          is_active: false,
        },
      });
  
      const saltedPassword = hashSync(
        createSalesDto?.password ?? 'password',
        12,
      );
  
      const formattedUsername =
        createSalesDto?.username?.replace(/ /g, '_') ?? null;
       
      const sales_data: Prisma.salesCreateInput = {
        full_name: createSalesDto.full_name,
        bank_branch: createSalesDto?.bank_branch,
        account_name: createSalesDto?.account_name,
        phone_number: createSalesDto?.phone_number,
        account_number: createSalesDto?.account_number,
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
        
        is_active: true, // Ensure the new manager is active
      };
 
      
      const [sales] = await this.dbService.$transaction([
        this.dbService.manager.create({
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
        top_best,
        store_id,
        order_date_from,
        order_date_to,
        is_promotion
      } = query;

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

      const sales = await this.dbService.manager.findMany({
        where,
        skip,
        take: getTake(),
        include: {
 
          bank: true,
          store: true,
   
   
          users: true,
        },
      });

      const dataSales = sales.map((item) => {
    

        return {
          ...item,
        }
      })

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

     
      
      const sales = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          bank: true,
          store: true,
      
          users: true,
        },
      });

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateSalesDto: UpdateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      const sales = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          store: true,
        },
      });
      
      if (!sales) {
        throw new NotFoundException('Sales not found');
      }
  
      const SALES_ROLES: roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'Manager Store',
          },
        },
      });
  
      // Check if we're activating this manager
      if (updateSalesDto.is_active === 1 ) {
        // Deactivate other managers at this store
        await this.dbService.manager.updateMany({
          where: {
            store_id: updateSalesDto.store_id || sales.store_id,
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
  
      const salesUsername = updateSalesDto.full_name
        ? `${updateSalesDto.full_name
          .toLowerCase()
          .replace(/ /g, '_')}_${sales.store.store_name
            .toLowerCase()
            .replace(/ /g, '_')}`
        : sales?.users?.username;
      const salesPassword = updateSalesDto.password
        ? await hash(updateSalesDto.password, 12)
        : sales?.users?.password
          ? sales.users.password
          : await hash('password', 12);
  
      const salesData: Prisma.salesUpdateInput = {
        // ...(usersConnectOrCreate ? { users: usersConnectOrCreate } : {}),
        ...(sales.users && updateSalesDto.username && updateSalesDto.password
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
          : updateSalesDto.username && updateSalesDto.password
            ? {
              users: {
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
            }
            : undefined),
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
        full_name: updateSalesDto.full_name,
        nik: updateSalesDto.nik,
        is_active: updateSalesDto.is_active !== undefined ? Boolean(updateSalesDto.is_active) : sales.is_active,
        updated_at: new Date(),
        updated_by: user_id,
      };
  
      const updatedSales = await this.dbService.$transaction([
        this.dbService.manager.update({
          where: {
            id,
          },
          data: salesData,
          include: {
            users: true,
          },
        }),
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
      const sales = await this.dbService.manager.findMany({
        take: 10,
        where: {
          store_id,
          is_active: true
        },
        include: {
          users: true,
          store: true,
        },
      });
   
      return sales;
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
              status: IncentiveStatus.INSENTIF_DIBAYARKAN,
              notes: pair.notes ?? '',
              updated_at: new Date(),
              updated_by: user.id,
            },
          });
          await this.notifService.create(
            {
              sales_incentive: updateSales,
              orders: order,
            },
            'UPDATE',
            updateSales.updated_by,
            moduleTypeNotification.INCENTIVE,
            updateSales.id,
            updateSales.status,
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

  async salesExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        search,
        date_from,
        date_to,
        order_by,
        top_best,
        store_id,
      } = queryParams;
      // const skip = page * take - take;
      const where: Prisma.managerWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { full_name: { contains: search } },
              
              
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
        const orderDate = sales?.orders?.length > 0
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

  @Cron(CronExpression.EVERY_5_MINUTES)
  async deleteOrder() {
    try {
      const updatedSalesIncentives =
        await this.dbService.sales_incentive.findMany({
          where: {
            status: IncentiveStatus.POTENTIAL_INCENTIVE,
            quotation: {
              order: {
                status: {
                  category: 'WORKEND',
                },
              },
            },
          },
          select: {
            id: true,
            updated_by: true,
            status: true,
            quotation: {
              select: {
                order: {
                  select: {
                    id: true,
                    sales_id: true,
                    store_id: true,
                    vendor_id: true,
                  },
                },
              },
            },
          },
        });

      await this.dbService.sales_incentive.updateMany({
        where: {
          id: { in: updatedSalesIncentives.map((si) => si.id) },
        },
        data: {
          status: 2,
          created_at: new Date(),
        },
      });

      await Promise.all(
        updatedSalesIncentives.map(async (updateSales) => {
          const order = updateSales.quotation.order;

          if (order) {
            await this.notifService.create(
              {
                sales_incentive: updateSales,
                orders: order,
              },
              'UPDATE',
              updateSales.updated_by,
              moduleTypeNotification.INCENTIVE,
              updateSales.id,
              updateSales.status,
            );
          }
        }),
      );

      return {
        message: `${updatedSalesIncentives.length} sales incentives updated and notifications created successfully.`,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async salesUserManagement() {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 4);

      const targetYear = threeMonthsAgo.getFullYear();
      const targetMonth = threeMonthsAgo.getMonth();

      const endOfMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const batchSize = 100;

      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          orders: {
            every: {
              created_at: {
                lt: endOfMonth,
              },
            },
          },
          is_active: true
        },
        select: {
          id: true,
        },
        take: batchSize,
      });



      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log("No sales to update in this batch.");
        return;
      }


      const salesUpdate = await this.dbService.sales.updateMany({
        where: {
          id: {
            in: salesIds,
          },
        },
        data: {
          is_active: false,
        },
      });


      const usersUpdate = await this.dbService.users.updateMany({
        where: {
          sales: {
            some: {
              id: {
                in: salesIds,
              },
            },
          },
        },
        data: {
          is_active: false,
        },
      });


      return { salesUpdate, usersUpdate };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async managementSalesSixMonth() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 7);

      const targetYear = sixMonthsAgo.getFullYear();
      const targetMonth = sixMonthsAgo.getMonth();

      const endOfMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const batchSize = 200;
      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          orders: {
            every: {
              created_at: {
                lt: endOfMonth,
              },
            },
          },
          is_active: true
        },
        select: {
          id: true,
        },
        take: batchSize,
      });

      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log("No sales to update in this batch.");
        return;
      }

      console.log("SALES TO UPDATE (BATCH):", salesIds);

      const salesIncentive = await this.dbService.sales.updateMany({
        where: {
          id: {
            in: salesIds,
          },
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
        },
      });

      console.log("SALES UPDATED", salesIncentive);

      const usersUpdate = await this.dbService.users.updateMany({
        where: {
          sales: {
            some: {
              id: {
                in: salesIds,
              },
            },
          },
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
        },
      });

      console.log("USERS UPDATED", usersUpdate);

      return { salesIncentive, usersUpdate };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async apiManagementSales(range_date: 7 | 4) {
    try {
      const rangeMonthAgo = new Date();
      rangeMonthAgo.setMonth(rangeMonthAgo.getMonth() - range_date);

      const targetYear = rangeMonthAgo.getFullYear();
      const targetMonth = rangeMonthAgo.getMonth();

      const endOfMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const batchSize = 200;
      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          orders: {
            every: {
              created_at: {
                lt: endOfMonth,
              },
            },
          },
          is_active: true
        },
        select: {
          id: true,
        },
        take: batchSize,
      });

      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log("No sales to update in this batch.");
        return;
      }


      // Step 2: Update sales dengan batch size
      let salesUser: any, usersUpdate: any
      if (range_date === 7) {
        salesUser = await this.dbService.sales.updateMany({
          where: {
            id: {
              in: salesIds,
            },
          },
          data: {
            is_active: false,
            deleted_at: new Date(),
          },
        });

        usersUpdate = await this.dbService.users.updateMany({
          where: {
            sales: {
              some: {
                id: {
                  in: salesIds,
                },
              },
            },
          },
          data: {
            is_active: false,
            deleted_at: new Date(),
          },
        });
      } else if (range_date === 4) {
        salesUser = await this.dbService.sales.updateMany({
          where: {
            id: {
              in: salesIds,
            },
          },
          data: {
            is_active: false,
          },
        });


        usersUpdate = await this.dbService.users.updateMany({
          where: {
            sales: {
              some: {
                id: {
                  in: salesIds,
                },
              },
            },
          },
          data: {
            is_active: false,
          },
        });
      }

      return { salesIncentive: salesUser, usersUpdate };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async updateDateSalesIncentive(id: number) {
    try {
      const salesIncentive = await this.dbService.sales_incentive.findFirst({
        where: {
          deleted_at: null,
          status: 2,
          id: id
        },
        include: {
          incentive: true,
          quotation: true
        },
      });
      const quotationSalesIncentive = await this.dbService.quotation.findFirst({
        where: {
          id: salesIncentive.quotation_id,
        },
        select: {
          order: {
            select: {
              order_history: {
                where: {
                  status: {
                    category: 'WORKEND'
                  }
                },
                orderBy: {
                  created_at: 'desc'
                },
                include: {
                  status: true
                }
              }
            }
          }
        }
      });

      let comission = 0;
      if (salesIncentive.incentive.type === 1) {
        comission += Number(salesIncentive.quotation.quotation_grand_total) * (Number(salesIncentive.incentive.incentive) / 100);
      } else if (salesIncentive.incentive.type === 2) {
        comission += Number(salesIncentive.incentive.incentive);
      }

      const updateSalesIncentive = await this.dbService.sales_incentive.update({
        where: {
          id: id
        },
        data: {
          nominal: Math.floor(comission),
          created_at: new Date(quotationSalesIncentive.order.order_history[0].created_at)
        }
      })

      return updateSalesIncentive
    } catch (error) {
      console.error(error);
      throw error
    }
  }

  async deleteSalesIncentive(id: number) {
    try {
      const deleteSalesIncentive = await this.dbService.sales_incentive.delete({
        where: {
          id: id
        },
      });

      return deleteSalesIncentive
    } catch (error) {
      console.error(error);
      throw error
    }
  }
}
