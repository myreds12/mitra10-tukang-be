import { Injectable } from '@nestjs/common';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CsiService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
  ) {}

  async create(createCsiDto: CreateCsiDto) {
    const csi_data: Prisma.csi_templateCreateInput = createCsiDto;

    const [csi] = await this.dbService.$transaction([
      this.dbService.csi_template.create({
        data: csi_data,
      }),
    ]);

    return csi;
  }

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } = query;
    const total = await this.dbService.csi_template.count();
    const data = await this.dbService.csi_template.findMany({
      skip: page * take - take,
      take: take > 0 ? take : undefined,
      where: {
        AND: [
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      },
      orderBy: {
        created_at: order_by,
      },
    });

    return {
      data,
      options: {
        total,
        page,
        take,
        takeTotal: data.length,
      },
    };
  }

  async findOne(id: number) {
    const data = await this.dbService.csi_template.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    return data;
  }

  async update(id: number, updateCsiDto: UpdateCsiDto) {
    const data = await this.dbService.csi_template.update({
      where: {
        id,
      },
      data: updateCsiDto,
    });

    return data;
  }

  remove(id: number) {
    return `This action removes a #${id} csi`;
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM)
  async getDataCsi() {
    const sheets = this.googleSheetConnectorService.getGoogleSheetConnect();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: '1ZMHyrKZPQNu_2quV4-h2Qbm-LLQg3IwUgAxazlTvixg',
      range: 'R2:S2',
    });

    const data = await sheets.spreadsheets.values
      .get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `B${res.data.values[0][0]}:L${res.data.values[0][1]}`,
      })
      .then((data) => data.data.values);

    const response = data.map((row) => {
      return {
        'Nama Toko': row[0],
        'Member Id': row[1],
        'Nama Member': row[2],
        'Nama Vendor': row[3],
        'Performance Rate': row[4],
        'Delivery Rate': row[5],
        'Invoicing Rate': row[6],
        'Customer Service Rate': row[7],
        'Knowledge Rate': row[8],
        'Catatan Tambahan': row[9],
        'Email Adress Pemberi Jawaban': row[10],
      };
    });

    return response;
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM)
  async insertCSIToDatabase() {
    const data = await this.getDataCsi();
    const dataToInsert: Prisma.csiCreateManyInput[] = data.map((row) => {
      return {
        store_name: row['Nama Toko'],
        member_id: Number(row['Member Id']),
        member_name: row['Nama Member'],
        vendor_name: row['Nama Vendor'],
        performance_rate: Number(row['Performance Rate']),
        delivery_rate: Number(row['Delivery Rate']),
        invoicing_rate: Number(row['Invoicing Rate']),
        customer_service_rate: Number(row['Customer Service Rate']),
        knowledge_rate: Number(row['Knowledge Rate']),
        notes: row['Catatan Tambahan'],
        email_address: row['Email Adress Pemberi Jawaban'],
      };
    });
    await this.dbService.csi.deleteMany();
    const result = await this.dbService.csi.createMany({
      data: dataToInsert,
    });
    return result;
  }

  async getCsiFromDatabase(query: QueryParamsDto) {
    const { page, take, vendor_id, storeId, member_id, date_from, date_to } =
      query;
    const skip = page * take - take;

    let vendor, store, member;

    if (vendor_id) {
      vendor = await this.dbService.vendor.findFirst({
        where: { id: +vendor_id },
      });
      if (!vendor) throw new Error('Vendor not found');
    }

    if (storeId) {
      store = await this.dbService.store.findFirst({ where: { id: +storeId } });
      if (!store) throw new Error('Store not found');
    }

    if (member_id) {
      member = await this.dbService.members.findFirst({
        where: { id: +member_id },
      });
      if (!member) throw new Error('Member not found');
    }

    console.log(vendor, store, member);

    const where: Prisma.csiWhereInput = {
      AND: [
        ...(store ? [{ store_name: { contains: store.store_name } }] : []),
        ...(vendor ? [{ vendor_name: { contains: vendor.company_name } }] : []),
        ...(date_from && date_to
          ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              },
            ]
          : []),
        ...(member ? [{ member_id: member.id }] : []),
      ],
    };

    const csi = await this.dbService.csi.findMany({
      skip,
      where,
      take: take > 0 ? take : undefined,
      orderBy: { created_at: 'desc' },
    });

    return csi;
  }
}
