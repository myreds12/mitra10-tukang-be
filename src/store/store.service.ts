import {
  Injectable,
  HttpStatus,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { hash } from 'bcrypt';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs'
import * as path from 'path';

@Injectable()
export class StoreService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}
  async create(dto: CreateStoreDto, user_id: number) {
    try {
      const role = await this.dbService.roles.findFirst({
        where: {
          name: {
            equals: 'Store CS',
          },
        },
      });
      const username = dto.default_username
        ? dto.default_username
        : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const user = await this.dbService.users.create({
        data: {
          username,
          password: await hash(dto?.default_password ?? 'password', 10),
          role_id: role.id,
        },
      });
      const store = await this.dbService.store.create({
        data: {
          user_id: user.id,
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          created_by: user_id,
        },
      });
      
      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return { data: store, meta: { user } };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      status,
      date_from,
      date_to,
      order_by,
      area_id,
      store_group_id,
    } = query;

    const skip = page * take - take;

    const where: Prisma.storeWhereInput = {
      AND: [
        ...(area_id
          ? [
              {
                OR: [{ area_id: { equals: area_id } }],
              },
            ]
          : []),
        ...(search
          ? [
              {
                OR: [
                  {
                    store_name: {
                      contains: search,
                    },
                  },
                ],
              },
            ]
          : []),
        ...(store_group_id
          ? [
              {
                OR: [{ store_group_id: { equals: store_group_id } }],
              },
            ]
          : []),
      ],
      deleted_at: null,
    };

    const store = await this.dbService.store.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        area: true,
        users: true,
      },
    });

    const total = await this.dbService.store.count({
      where,
    });

    return {
      data: store,
      meta: {
        total,
        skip,
        page,
        take,
      },
    };
  }

  async findOne(id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id,
        },
      });

      return store;
    } catch (error) {
      console.log(error);
    }
  }

  async update(id: number, dto: UpdateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id
        },
        include: {
          users: true
        }
      });
      const username = dto.default_username
      ? dto.default_username
      : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const user = await this.dbService.users.update({
      where: {
        id: store.user_id
      },
      data: {
        username,
        password: await hash(dto?.default_password ?? 'password', 10),
      },
    });
      const stores = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });     

      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return {
        data: store,
        meta: { user },
      };
    } catch (error) {
      console.log(error);

      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const store = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          deleted_by: user_id,
          deleted_at: new Date(),
        },
      });

      return;
    } catch (error) {
      console.log(error);
      throw new BadGatewayException('Failed to delete store');
    }
  }

  async getCode() {
    const stores = await this.dbService.store.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return stores[0] || null;
  }

  async storeExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {data} = await this.findAll(queryParams);

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Data Profile Sales ',
      {
        properties:
        {
          tabColor:
          {
            argb: 'FF4CAF50'
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
            footer: 0.3
          }
        }
      }
    );

    worksheet.columns = [
      { header: 'Toko Id', key: 'id', width: 20 },
      { header: 'Nama Toko', key: 'store_name', width: 35 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Alamat', key: 'address', width: 35 },
      { header: 'Phone Number', key: 'phone_number', width: 35 },
      { header: 'Nama Bank', key: 'bank_name', width: 35 },
      { header: 'Nomor Akun', key: 'bank_number', width: 35 },
      { header: 'Nama Akun', key: 'bank_account', width: 35 },
      { header: 'Username', key: 'username', width: 35 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0000FF' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });


    data.forEach(store => {
      const row = worksheet.addRow({
        id: store.id,
        store_name: store.store_name ? store.store_name : '',
        email: store.email ? store.email : '',
        address: store.address ? store.address : '',
        phone_number: store.phone_number_1 ? store.phone_number_1 : store.phone_number_2,
        bank_name: store.bank_name ? store.bank_name : '',
        bank_number: store.bank_number ? store.bank_number : '',
        bank_account: store.bank_account ? store.bank_account : '' ,
        username: store.users ? store.users.username : '',
      });

      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    const getFormattedDate = () => {
      const now = new Date();
      const tahun = now.getFullYear();
      const bulan = String(now.getMonth() + 1).padStart(2, '0');
      const tanggal = String(now.getDate()).padStart(2, '0');
      return `${tahun}-${bulan}-${tanggal}`;
    };


    const createExcelFilePath = (baseName) => {
      const folderPath = './uploads/excel/store';
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const excelFileName = `${baseName}.xlsx`;
      return path.join(folderPath, excelFileName);
    };

    const writeWorkbookAndSendResponse = async (workbook, excelFilePath, res) => {
      await workbook.xlsx.writeFile(excelFilePath);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(excelFilePath)}`);

      const fileStream = fs.createReadStream(excelFilePath);
      fileStream.pipe(res);
    };

    const generateExcelFile = async (data, res) => {
      const baseName = `DataStore-${getFormattedDate()}`;
      const excelFilePath = createExcelFilePath(baseName);

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    }

    return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
    
  }
}
