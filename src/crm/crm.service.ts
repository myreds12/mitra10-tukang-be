import { Injectable, NotFoundException } from '@nestjs/common';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCsiDto } from 'src/csi/dto/create-csi.dto';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateCsiDto } from 'src/csi/dto/update-csi.dto';
import { ConfigService } from '@nestjs/config';
import { GoogleScriptApiService } from './google-script-api.service';
import { CRM_TYPE } from 'src/complaints/dto/crm_type.enum';
import * as path from 'path';

@Injectable()
export class CrmService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
    private readonly googleScriptApiService: GoogleScriptApiService,
  ) {}

  async create(createCsiDto: CreateCsiDto) {
    try {
      const csi_data: Prisma.csi_templateCreateInput = createCsiDto;

      const [csi] = await this.dbService.$transaction([
        this.dbService.csi_template.create({
          data: csi_data,
        }),
      ]);

      return csi;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { take, page, date_from, date_to, order_by } = query;
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
        meta: {
          total,
          page,
          take,
          takeTotal: data.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const data = await this.dbService.csi_template.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          csi_answers: {
            select: {
              id: true,
              data: true,
            },
          },
          email_messages: true,
        },
      });

      if (!data) throw new NotFoundException('CSI Not Found');

      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateCsiDto: UpdateCsiDto) {
    try {
      const data = await this.dbService.csi_template.update({
        where: {
          id,
        },
        data: updateCsiDto,
      });

      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.csi_answers.updateMany({
        where: {
          csi_template_id: id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
      const csi = await this.dbService.csi_template.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return csi;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async fetchGFormAnswers(id: string) {
    const spreadsheetInstances =
      this.googleSheetConnectorService.getGoogleSheetConnect();

    const {
      data: { sheets },
    } = await spreadsheetInstances.spreadsheets.getByDataFilter({
      spreadsheetId: this.configService.get<string>('SPREADSHEET_CRM'),
    });

    const { properties } = sheets[0];

    const { data } = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: id,
      range: `A1:${this.numberToColumnLabel(
        properties.gridProperties.columnCount,
      )}${properties.gridProperties.rowCount}`,
    });
    const keys = data.values[0];
    const parsedData = data.values.slice(1).map((row, rindex) => {
      const obj = { Row: rindex + 1 };
      keys.forEach((key, index) => {
        obj[key] = row[index];
      });

      return obj;
    });

    return parsedData;
  }

  // async syncAnswer(complaint_id: number) {
  //   const spreadsheetId = this.configService.get<string>('SPREADSHEET_CRM');

  //   await this.storeAnswer(spreadsheetId, complaint_id);
  // }
  async syncAnswer(complaint_id: number) {
    //const spreadsheetId = this.configService.get<string>('SPREADSHEET_CRM');

    await this.storeAnswer(complaint_id);
  }

  //async storeAnswer(spreadsheetId: string, complaint_id: number) {
  async storeAnswer(complaint_id: number) {
    const spreadsheetInstances =
      this.googleSheetConnectorService.getGoogleSheetConnect();

    const complaints = await this.dbService.complaints.findFirst({
      where: {
        id: complaint_id,
        deleted_at: null,
        is_sync: 0,
      },
      include: {
        orders: {
          include: {
            store: {
              include: {
                area: true,
              },
            },
            members: true,
            vendor: true,
          },
        },
        remedials: {
          orderBy: {
            created_at: 'desc',
          },
        },
        complaint_channels: true,
        complaint_histories: {
          include: {
            complaint_evidence: true,
          },
        },
        status: true,
      },
    });

    if (!complaints) {
      return;
    }

    const userIds = [
      complaints.created_by,
      complaints.updated_by,
      complaints.deleted_by,
    ].filter(Boolean);

    const users = await this.dbService.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });

    const userMap = users.reduce(
      (acc, user) => ({
        ...acc,
        [user.id]: user,
      }),
      {},
    );

    const complaintWithUser = {
      ...complaints,
      created_by: userMap[complaints.created_by] || null,
      updated_by: userMap[complaints.updated_by] || null,
      deleted_by: userMap[complaints.deleted_by] || null,
    };

    //console.log('KOMPLAIN USER', complaintWithUser);

    /* ga pelru cek karena langsung
    const sheetHeader = await this.getSpreadsheetHeader(spreadsheetId);

    // console.log('Sheet Header:', sheetHeader);

    if (!sheetHeader) {
      // console.log('No header found in the spreadsheet.');
      return;
    }

    const values = [complaintWithUser].map((complaint) => {
      const rowData = sheetHeader.map((header) => {
        let cellValue = '';

        switch (header) {
          case 'Timestamp':
            if (complaint.created_at) {
              const date = new Date(complaint.created_at);
              cellValue = `${String(date.getDate()).padStart(2, '0')}/${String(
                date.getMonth() + 1,
              ).padStart(2, '0')}/${date.getFullYear()} ${String(
                date.getHours(),
              ).padStart(2, '0')}:${String(date.getMinutes()).padStart(
                2,
                '0',
              )}:${String(date.getSeconds()).padStart(2, '0')}`;
            }
            break;
          case 'Store Region':
            cellValue = complaint.orders?.store?.area?.area ?? 'N/A';
            break;
          case 'Store Name':
            cellValue =
              complaint.orders?.store?.store_name?.toUpperCase() ?? 'N/A';
            break;
          case 'Customer Name':
            cellValue = complaint.orders?.members?.full_name ?? 'N/A';
            break;
          case 'Member Id':
            cellValue = complaint.orders.member_id.toString() ?? 'N/A';
            break;
          case 'Mobile':
            cellValue =
              complaint.orders?.members?.phone_number ??
              complaint.orders?.members?.whatsapp_number ??
              'N/A';
            break;
          case 'Email':
            cellValue = complaint.orders?.members?.email ?? '';
            break;
          case 'Complaint Detail':
            cellValue = complaint.description ?? 'N/A';
            break;
          case 'Detail Solution':
          case 'Feedback':
          case 'Closed Ticket Date':
            cellValue = '';
            break;
          case 'Complaint Dimension':
            cellValue = 'PROCESS';
            break;
          case 'Media':
            cellValue = complaint.complaint_channels?.name ?? 'N/A';
            break;
          case 'Feedback Value':
            cellValue = complaint.crm_type
              ? CRM_TYPE[complaint.crm_type]
              : 'Neutral';
            break;
          case 'Status':
            cellValue = 'Open';
            break;
          case 'Received By':
          case 'Updated By':
            cellValue = complaint.feedback_name ?? 'N/A';
            break;
          case 'Work By (Vendor or M10)':
            cellValue = 'M10';
            break;
          case 'Complaint Variable':
            cellValue = 'Installasi Yang Dilakukan Oleh Vendor';
            break;
          default:
            cellValue = 'N/A';
        }

        return cellValue;
      });

      return rowData;
    });

    await spreadsheetInstances.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: 'Instalation App!A1', // Mulai dari kolom A, baris 1
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: values,
      },
    });
    */

    // console.log(`${values.length} rows sent to the spreadsheet.`);

    const complaintsevidence =
      await this.dbService.complaint_evidence.findFirst({
        where: {
          complaint_history_id: complaintWithUser?.complaint_histories?.[0]?.id,
        },
      });

    // DEBUG
    console.log('history_id:', complaintWithUser?.complaint_histories?.[0]?.id);
    console.log('complaintsevidence:', complaintsevidence);
    console.log(
      'documentPath:',
      complaintsevidence?.evidence_location
        ? path.join(
            process.cwd(),
            'public',
            'complaints',
            complaintsevidence.evidence_location,
          )
        : 'N/A',
    );

    // Payload kosong, nanti bisa diisi sesuai kebutuhan
    const memberNumber =
      complaintWithUser.orders?.members?.phone_number ??
      complaintWithUser.orders?.members?.whatsapp_number ??
      'N/A';

    const formattedNumber = memberNumber.startsWith('08')
      ? '628' + memberNumber.slice(2)
      : memberNumber;

    //console.log(formattedNumber);
    const payload = {
      namaLengkap: complaintWithUser?.orders?.members?.full_name ?? 'N/A',
      mobile: formattedNumber,
      email: complaintWithUser?.orders?.members?.email ?? 'N/A',
      detail: complaintWithUser?.description ?? 'N/A',
      receivedByInstallationWeb:
        complaintWithUser?.orders?.store?.email ?? 'N/A',
      receivedBy: complaintWithUser?.pic_name ?? 'N/A',
      melaluiMedia: complaintWithUser?.complaint_channels?.name ?? 'N/A',
      locationIdInstallationWeb:
        complaintWithUser?.orders?.store?.zip_code ?? 'N/A',
      documentPath: complaintsevidence?.evidence_location
        ? path.join(
            process.cwd(),
            'uploads',
            'complaints',
            complaintsevidence.evidence_location,
          )
        : 'N/A',
      variable: 'Installasi yang dilakukan oleh vendor',
    };
    //console.log('Payload for Google Script API:', payload);
    var result = await this.googleScriptApiService.sendFormWithFile(payload);

    //console.log('result api', result.status);

    if (result.status === 200) {
      // Update `is_sync` to 1 for synced complaints
      const updateComplaint = await this.dbService.complaints.updateMany({
        where: {
          id: complaint_id,
        },
        data: {
          is_sync: 1,
        },
      });
    }

    // console.log('Update Complaint', updateComplaint);
    // console.log('Updated is_sync to 1 for all synced complaints.');
  }

  async getSpreadsheetHeader(spreadsheetId: string): Promise<string[] | null> {
    const spreadsheetInstances =
      this.googleSheetConnectorService.getGoogleSheetConnect();

    const response = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Instalation App!1:1', // Ambil baris pertama untuk header
    });

    const headers = response.data.values?.[0];

    if (!headers) {
      // console.log('No header found in the spreadsheet.');
      return null;
    }

    return headers;
  }

  numberToColumnLabel(column: number): string {
    let label = '';
    while (column > 0) {
      const remainder = (column - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      column = Math.floor((column - 1) / 26);
    }
    return label;
  }

  getSheetIdFromUrl(url: string) {
    const regex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1];
    } else {
      return null;
    }
  }

  async getLastRow(spreadsheetId: string, sheetName: string): Promise<number> {
    const spreadsheetInstances =
      this.googleSheetConnectorService.getGoogleSheetConnect();

    const response = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:A`,
    });

    const rows = response.data.values;

    return rows ? rows.length + 1 : 0;
  }
}
