import { Injectable } from '@nestjs/common';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class CsiService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
  ) {}
  create(createCsiDto: CreateCsiDto) {
    return 'This action adds a new csi';
  }

  findAll() {
    return `This action returns all csi`;
  }

  findOne(id: number) {
    return `This action returns a #${id} csi`;
  }

  update(id: number, updateCsiDto: UpdateCsiDto) {
    return `This action updates a #${id} csi`;
  }

  remove(id: number) {
    return `This action removes a #${id} csi`;
  }

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
          "Nama Toko": row[0],
          "Member Id": row[1],
          "Nama Member": row[2],
          "Nama Vendor": row[3],
          "Performance Rate": row[4],
          "Delivery Rate": row[5],
          "Invoicing Rate": row[6],
          "Customer Service Rate": row[7],
          "Knowledge Rate": row[8],
          "Catatan Tambahan": row[9],
          "Email Adress Pemberi Jawaban": row[10]
        };
      });

    return response;
  }

  async insertCSIToDatabase(){
    const data = await this.getDataCsi();
    const dataToInsert: Prisma.csiCreateManyInput[] = data.map((row) => {
      return {
        store_name: row["Nama Toko"],
        member_id: Number(row["Member Id"]),
        member_name: row["Nama Member"],
        vendor_name: row["Nama Vendor"],
        performance_rate: Number(row["Performance Rate"]),
        delivery_rate: Number(row["Delivery Rate"]),
        invoicing_rate: Number(row["Invoicing Rate"]),
        customer_service_rate: Number(row["Customer Service Rate"]),
        knowledge_rate: Number(row["Knowledge Rate"]),
        notes: row["Catatan Tambahan"],
        email_address: row["Email Adress Pemberi Jawaban"],
      }
    });
    await this.dbService.csi.deleteMany();
    const result = await this.dbService.csi.createMany({
      data: dataToInsert
    });
    return result;
  }

  async getCsiFromDatabase(query: QueryParamsDto){
    const { page,  take,skip, store_name, vendor_name, member_name } = query;

  //    const where: Prisma.ordersWhereInput = {
  //     AND: [
       
  //       ...(store_name ? [{ store_name: { contains: store_name } }] : []),
  //       ...(vendor_name ? [{ vendor_name: {contains: vendor_name}}] : []),
  //       ...(member_name ? [{ member_name: { contains: member_name } }] : []),
  //       deleted_at: null,
  //     ]
  //   };

  //   const orders = await this.dbService.csi.findMany({
  //     where,
  //     skip,
  //     take: take > 0 ? take : undefined,
  // })
  }
}
