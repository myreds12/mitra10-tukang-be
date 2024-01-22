import { Injectable } from '@nestjs/common';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

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
        spreadsheetId: '1ZMHyrKZPQNu_2quV4-h2Qbm-LLQg3IwUgAxazlTvixg',
        range: `B${res.data.values[0][0]}:L${res.data.values[0][1]}`,
      })
      .then((data) => data.data.values);

      const response = data.map((row) => {
        return {
          "NamaToko": row[0],
          "MemberId": row[1],
          "NamaMember": row[2],
          "Performance": row[3],
          "Delivery": row[4],
          "Invoicing": row[5],
          "CustomerService": row[6],
          "Knowledge": row[7],
          "CatatanTambahan": row[8],
          "EmailAdress": row[9]
        };
      });

    return response;
  }
}
