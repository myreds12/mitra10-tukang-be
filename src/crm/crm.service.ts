import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCrmDto } from './dto/create-crm.dto';
import { UpdateCrmDto } from './dto/update-crm.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'winston';
import { CreateCsiDto } from 'src/csi/dto/create-csi.dto';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateCsiDto } from 'src/csi/dto/update-csi.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CRM_TYPE } from 'src/complaints/dto/crm_type.enum';

@Injectable()
export class CrmService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) { }



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
          email_messages: true
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

  async sendCsiMail(id: number, orderId: number) {
    try {
      const csi = await this.findOne(id);
      const order = await this.dbService.orders.findFirstOrThrow({
        where: { id: orderId },
      });

    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const csiAnswers = await this.dbService.csi_answers.updateMany({
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

  @Cron(CronExpression.EVERY_5_SECONDS)
  async syncAnswer() {
    const spreadsheetId = this.configService.get<string>('SPREADSHEET_CRM');

    await this.storeAnswer(spreadsheetId);
  }



  async storeAnswer(spreadsheetId: string) {
    const spreadsheetInstances = this.googleSheetConnectorService.getGoogleSheetConnect();
    const lastRow = await this.getLastRow(spreadsheetId, "Form Responses 1");
    
    const complaints = await this.dbService.complaints.findMany({
      where: {
        deleted_at: null,
        is_sync: 0
      },
      include: {
        orders: {
          include: {
            store: {
              include: {
                area: true
              }
            },
            members: true,
            vendor: true,
          }
        },
        remedials: {
          orderBy: {
            created_at: 'desc'
          }
        },
        complaint_channels: true,
        status: true,
      },
    });

    if (complaints.length === 0) {
      return;
    }
    const userIds = [
      ...new Set(
        complaints
          .flatMap((order) => [
            order.created_by,
            order.updated_by,
            order.deleted_by,
          ])
          .filter(Boolean),
      ),
    ];

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

    const complaintWithUser = complaints.map((order) => ({
      ...order,
      created_by: order.created_by ? userMap[order.created_by] || null : null,
      updated_by: order.updated_by ? userMap[order.updated_by] || null : null,
      deleted_by: order.deleted_by ? userMap[order.deleted_by] || null : null,
    }));

    const sheetHeader = await this.getSpreadsheetHeader(spreadsheetId);

    if (!sheetHeader) {
      console.log("No header found in the spreadsheet.");
      return;
    }
    const ajColumnIndex = sheetHeader.indexOf("AJ") !== -1 ? sheetHeader.indexOf("AJ") : sheetHeader.length + 9;
    const akColumnIndex = sheetHeader.indexOf("AK") !== -1 ? sheetHeader.indexOf("AJ") : sheetHeader.length + 10;
    const alColumnIndex = sheetHeader.indexOf("AL") !== -1 ? sheetHeader.indexOf("AJ") : sheetHeader.length + 11;
    const amColumnIndex = sheetHeader.indexOf("AM") !== -1 ? sheetHeader.indexOf("AM") : sheetHeader.length + 12;


    const values = complaintWithUser.map((complaint) => {
      const filledHeaders = new Set(); // Set untuk melacak header yang sudah diisi
      const rowData = sheetHeader.map((header) => {
        if (filledHeaders.has(header)) {
          return '';
        }
    
        let cellValue : any = ""; 
    
        switch (header) {
          case "Timestamp":
            const date = new Date(complaint.created_at);
            cellValue = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
            break;
          case "Store Region":
            cellValue = complaint.orders?.store.area.area || "N/A";
            break;
          case "Store Name":
            cellValue = complaint.orders?.store.store_name.toUpperCase() || "N/A";
            break;
          case "Customer Name":
            cellValue = complaint.orders?.members?.full_name || "N/A";
            break;
          case "Member Id":
            cellValue = complaint.orders?.member_id || "N/A";
            break;
          case "Mobile":
            cellValue = complaint.orders?.members?.phone_number ?? complaint.orders?.members?.whatsapp_number;
            break;
          case "Email":
            cellValue = complaint.orders?.members?.email || "";
            break;
          case "Complaint Detail":
            cellValue = complaint.description;
            break;
          case "Detail Solution":
            cellValue = "";
            break;
          case "Feedback":
            cellValue = "";
            break;
          case "Complaint Dimension":
            cellValue = "PROCESS";
            break;
          case "Media":
            cellValue = complaint.complaint_channels?.name || "N/A";
            break;
          case "Feedback Value":
            cellValue = complaint.crm_type ? CRM_TYPE[complaint.crm_type] : "Neutral";
            break;
          case "Status":
            cellValue = "Open";
            break;
          case "Closed Ticket Date":
            cellValue = '';
            break;
          case "Received By":
            cellValue = complaint.feedback_name;
            break;
          case "Updated By":
            cellValue = complaint.feedback_name;
            break;
          case "Date Received":
            const dateReceived = new Date(complaint.complaint_received_date);
            cellValue = `${String(dateReceived.getDate()).padStart(2, '0')}/${String(dateReceived.getMonth() + 1).padStart(2, '0')}/${dateReceived.getFullYear()}`;
            break;
          case "Complaint Variable":
            cellValue = 'Installasi Yang Dilakukan Oleh Vendor'; 
            break;
          default:
            cellValue = "N/A";
        }
    
        filledHeaders.add(header); 
        return cellValue;
      });
      const dateReceived = new Date(complaint.complaint_received_date);
      const formattedDateReceived = `${String(dateReceived.getDate()).padStart(2, '0')}/${String(dateReceived.getMonth() + 1).padStart(2, '0')}/${dateReceived.getFullYear()}`;
      rowData[ajColumnIndex] = formattedDateReceived;
      rowData[akColumnIndex] = `=CONCATENATE(C${lastRow};D${lastRow};E${lastRow};F${lastRow};G${lastRow};H${lastRow};I${lastRow})`;

      rowData[alColumnIndex] = `=CONCATENATE(X${lastRow};Y${lastRow};Z${lastRow};AA${lastRow};AB${lastRow};AC${lastRow};AD${lastRow};AE${lastRow};AF${lastRow};AG${lastRow};AH${lastRow};AI${lastRow})`;
      rowData[amColumnIndex] = `=VLOOKUP(AK${lastRow};'Store Master'!A:C;3;0)`;

    
      return rowData;
    });
    
     


    await spreadsheetInstances.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: "Form Responses 1", // Starting point in the sheet
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: values,
      },
    });

    console.log(`${values.length} rows sent to the spreadsheet.`);

    // Update `is_sync` to 1 for synced complaints
    const complaintIds = complaints.map(complaint => complaint.id);
    await this.dbService.complaints.updateMany({
      where: {
        id: {
          in: complaintIds
        }
      },
      data: {
        is_sync: 1
      }
    });

    console.log("Updated is_sync to 1 for all synced complaints.");
  }


  async getSpreadsheetHeader(spreadsheetId: string): Promise<string[] | null> {
    const spreadsheetInstances = this.googleSheetConnectorService.getGoogleSheetConnect();

    const response = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: "A1:Z1", // Ambil baris pertama untuk header
    });

    const headers = response.data.values?.[0];

    if (!headers) {
      console.log("No header found in the spreadsheet.");
      return null;
    }

    return headers; 
  }

  numberToColumnLabel(column: number): string {
    let label = '';
    while (column > 0) {
      let remainder = (column - 1) % 26;
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

  async  getLastRow(spreadsheetId: string, sheetName: string): Promise<number> {
    const spreadsheetInstances = this.googleSheetConnectorService.getGoogleSheetConnect();
  
    const response = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:A`, 
    });
  
    const rows = response.data.values;
  
    return rows ? rows.length + 1 : 0;
  }
}
