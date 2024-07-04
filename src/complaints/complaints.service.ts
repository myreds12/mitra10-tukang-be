import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, complaints, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { x } from 'pdfkit';

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
  ) {}
  async create(
    createComplaintDto: CreateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;
      console.log('createComplaintDto', createComplaintDto);

      const evidences: Array<Prisma.complaint_evidenceCreateManyComplaint_historiesInput> =
        complaint_evidences.map((file) => ({
          evidence_location: file.filename,
          created_by: user_id,
        }));

      const COMPLAINT_STATUS = await this.dbService.status.findFirst({
        where: {
          id: createComplaintDto.complaint_status,
        },
      });

      // if (
      //   !COMPLAINT_STATUS.category.includes('INVESTIGATED' || 'WARRANTYCLAIM')
      // )
      //   throw new BadRequestException('Status does not exist!');

      const findOrder = await this.dbService.orders.findFirst({
        where: {
          id: createComplaintDto.order_id,
        },
      });
      const status = await this.dbService.status.findMany();

      const statusDone = status.find((i) =>
        i.category.toLocaleLowerCase().includes('done'),
      );

      const workEnd = status.find((i) =>
        i.category.toLocaleLowerCase().includes('workend'),
      );

      if (!findOrder) throw new BadRequestException('Order does not exist!');
      let now = new Date();
      now.setDate(now.getDate() + 7);

      // if (
      //   (findOrder.created_at > now &&
      //     findOrder.project_status_id !== statusDone.id) ||
      //   findOrder.project_status_id !== workEnd.id
      // )
      //   throw new BadRequestException('You cannot claim this order!');

      const complaintData: Prisma.complaintsCreateInput = {
        orders: {
          connect: {
            id: createComplaintDto.order_id,
          },
        },
        complaint_channels: {
          connect: {
            id: createComplaintDto.complaint_channel,
          },
        },
        status: {
          connect: {
            id: COMPLAINT_STATUS.id,
          },
        },
        description: createComplaintDto.description,
        pic_name: createComplaintDto.pic_name,
        complaint_date: new Date(createComplaintDto.complaint_date),
        type: createComplaintDto.type,
        created_by: user_id,
        complaint_histories: {
          create: {
            status_id: COMPLAINT_STATUS.id,
            reason: createComplaintDto?.complaint_histories?.reason ?? '',
            created_by: user_id,
            complaint_evidence: {
              createMany: { data: evidences },
            },
          },
        },
      };

      const [complaint] = await this.dbService.$transaction([
        this.dbService.complaints.create({
          data: complaintData,
        }),
      ]);

      await this.orderService.setStatus(
        complaint.order_id,
        complaint.complaint_status,
        user,
      );

      return complaint;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        tukang_id,
        store_id,
        vendor_id,
      } = query;
      const skip = page * take - take;

      const where: Prisma.complaintsWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : null,
          search
            ? { complaint_channels: { name: { contains: search } } }
            : null,
          store_id
            ? {
                orders: {
                  store_id: {
                    in: store_id,
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                orders: {
                  vendor_id: {
                    equals: vendor_id,
                  },
                },
              }
            : undefined,
          tukang_id
            ? {
                orders: {
                  work_orders: {
                    work_order_tukang: {
                      some: {
                        tukang_id: tukang_id,
                      },
                    },
                  },
                },
              }
            : undefined,
          date_from && date_to
            ? {
                complaint_date: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : null,
        ].filter((condition) => Boolean(condition)),
      };

      const complaint = await this.dbService.complaints.findMany({
        take: take <= 0 ? undefined : take,
        skip,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          complaint_channels: true,
          complaint_histories: {
            include: {
              status: true,
              complaint_evidence: true,
            },
          },
          remedials: true,
          status: true,
          orders: {
            include: {
              members: true,
              sales: true,
              store: true,
              status: true,
              vendor: true,
              m_order_details: true,
            },
          },
        },
      });
      const total = await this.dbService.complaints.count({
        where,
      });
      const complaintGrandTotal = await this.dbService.complaints
        .findMany({
          include: {
            orders: true,
          },
        })
        .then((data) =>
          data.reduce((acc, curr) => acc + Number(curr.orders.grand_total), 0),
        );
      const totalComplaintPerMonth = {};
      const totalComplaintGrandTotalPerMonth = {};
      const allMonths = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];

      allMonths.forEach((month) => {
        totalComplaintGrandTotalPerMonth[month] = 0;
      });

      complaint.forEach((complaint) => {
        const month = new Date(complaint.created_at).toLocaleString('id-ID', {
          month: 'long',
        });
        const grandTotalPerMonth = Number(complaint.orders.grand_total);

        if (!totalComplaintPerMonth[month]) {
          totalComplaintPerMonth[month] = 0;
        }

        totalComplaintPerMonth[month]++;
        totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
      });

      const monthlyComplaint = allMonths.map((month) => ({
        month,
        totalOrder: totalComplaintPerMonth[month] || 0,
        totalOrderGrandTotalPerMonth:
          totalComplaintGrandTotalPerMonth[month] || 0,
      }));

      return {
        data: complaint,
        meta: {
          total,
          page,
          take,
          skip,
          complaintGrandTotal,
          monthlyComplaint,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          complaint_channels: true,
          complaint_histories: {
            include: {
              status: true,
              complaint_evidence: true,
            },
          },
          remedials: {
            include: {
              remedial_evidences: true,
            },
          },
          status: true,
          orders: {
            include: {
              members: true,
              sales: true,
              store: true,
              status: true,
              vendor: true,
              m_order_details: {
                include: {
                  item: true,
                },
              },
            },
          },
        },
      });

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateComplaintDto: UpdateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;
      const complaints = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
      });

      const status = await this.dbService.status.findMany();

      if (!complaints)
        throw new HttpException('Complaint Not Found!', HttpStatus.NOT_FOUND);

      await this.dbService.complaint_evidence.updateMany({
        where: {
          complaint_history_id:
            updateComplaintDto?.complaint_histories?.id ?? 0,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      const evidences = complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

      const orderConn = updateComplaintDto.order_id
        ? {
            connect: {
              id: updateComplaintDto.order_id,
            },
          }
        : undefined;

      const orders = await this.dbService.orders.findFirst({
        where: {
          id: updateComplaintDto?.order_id ?? complaints.order_id,
        },
        include: {
          status: true,
        },
      });
      let statusOrderUpdate;

      const complaintApprovedByHoStatus = status.find((x) =>
        x.category.toLocaleLowerCase().includes('complaintapprovedbyho'),
      )?.id;
      const surveyStatusCategories = ['SURVEYREQ', 'SURVEYSTART', 'SURVEYEND'];
      const workStatusCategories = ['WORKREQ', 'WORKSTART', 'WORKEND'];

      if (
        complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
        surveyStatusCategories.includes(orders.status.category) 
      ) {
        statusOrderUpdate = status.find((x) =>
          x.category.toLowerCase().includes('resurveyreq'),
        ).id;
      } else if (
        complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
        workStatusCategories.includes(orders.status.category) 
      ) {
        statusOrderUpdate = status.find((x) =>
          x.category.toLowerCase().includes('reworkreq'),
        ).id;
      }

      // console.log(
      //   Boolean(surveyStatusCategories.includes(orders.status.category)),
      // );
      // console.log(
      //   Boolean(workStatusCategories.includes(orders.status.category)),
      // );

      // console.log(statusOrderUpdate);

      const complaint_channelsConn = updateComplaintDto.complaint_channel
        ? {
            connect: {
              id: updateComplaintDto.complaint_channel,
            },
          }
        : undefined;

      const complaintData: Prisma.complaintsUpdateInput = Object.fromEntries(
        Object.entries({
          orders: orderConn,
          complaint_channels: complaint_channelsConn,
          pic_name: updateComplaintDto.pic_name,
          description: updateComplaintDto.description ?? undefined,
          complaint_date: updateComplaintDto.complaint_date
            ? new Date(updateComplaintDto.complaint_date)
            : undefined,
          // complaint_status: updateComplaintDto?.complaint_status,
          updated_by: user_id,
          complaint_histories: {
            create: {
              status_id: complaints.complaint_status,
              reason:
                updateComplaintDto?.complaint_histories?.reason ?? undefined,
              created_by: user_id,
              complaint_evidence: evidences.length
                ? {
                    createMany: {
                      data: evidences,
                    },
                  }
                : undefined,
            },
          },
        }).filter(([key, value]) => value !== undefined),
      );
      // const complaintsUpdate = await this.dbService.complaints.update({
      //   where: {
      //     id: id,
      //   },
      //   data: complaintData,
      // });
      // console.log('update', complaintsUpdate);

      console.log('complaintData', complaintData);
      if(statusOrderUpdate){
        await this.orderService.setStatus(orders.id, statusOrderUpdate, user);
      }

      const [complaint] = await this.dbService.$transaction([
        this.dbService.complaints.update({
          where: {
            id: id,
          },
          data: {
            ...complaintData,
            ...(updateComplaintDto.complaint_status ? {
              status: {
                connect: {
                  id: updateComplaintDto?.complaint_status,
                },
              },
            } : undefined)
          },
        }),
      ]);

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.complaints.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getCode() {
    try {
      const complaints = await this.dbService.complaints.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return complaints[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatus(id: number, status_id: number, payload: { reason?: string }) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          status: true,
        },
      });

      if (
        !['DRAFTED', 'INVESTIGATE', 'INVESTIGATED'].includes(
          complaint.status.category,
        )
      )
        throw new BadRequestException('Cannot Change Status');

      const data = await this.dbService.complaints.update({
        where: {
          id,
        },
        data: {
          status: {
            connect: {
              id: status_id,
            },
          },
        },
      });

      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async complaintExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Keluhan', {
        properties: {
          tabColor: { argb: 'FF00FF00' },
          outlineLevelCol: 2,
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
        { header: 'Compaint ID', key: 'id', width: 10 },
        { header: 'Order ID', key: 'order_id', width: 10 },
        { header: 'Complaint Melalui', key: 'complaint_channel', width: 20 },
        { header: 'Deskripsi', key: 'description', width: 40 },
        { header: 'Tanggal Complaint', key: 'complaint_date', width: 25 },
        { header: 'Feedback Name', key: 'feedback_name', width: 25 },
        { header: 'Feedback Role', key: 'feedback_role', width: 25 },
        { header: 'Complaint Dibuat', key: 'created_at', width: 25 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((complaint) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

        const row = worksheet.addRow({
          id: complaint.id,
          order_id: complaint.order_id,
          complaint_channel: complaint.complaint_channels
            ? complaint.complaint_channels.name
            : 'N/a',
          description: complaint.description,
          complaint_date: formattedDateTime(complaint.complaint_date),
          feedback_name: complaint.feedback_name
            ? complaint.feedback_name
            : 'N/a',
          feedback_role: complaint.feedback_role
            ? complaint.feedback_role
            : 'N/a',
          created_at: formattedDateTime(complaint.created_at),
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

      // Calculate the total grand total of all complaints
      const totalGrandTotal = data.reduce((total, complaint) => {
        return (
          total + (complaint.orders ? Number(complaint.orders.grand_total) : 0)
        );
      }, 0);
      const formattedTotalGrandTotal = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
      }).format(totalGrandTotal);

      // Add total row
      const totalRow = worksheet.addRow({
        id: 'Total',
        order_id: '',
        complaint_channel: '',
        description: '',
        complaint_date: '',
        feedback_name: '',
        feedback_role: '',
        created_at: '',
      });
      totalRow.getCell('A').value = 'Total Keluhan';
      totalRow.getCell('H').value = formattedTotalGrandTotal;

      totalRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      totalRow.height = 30;

      worksheet.mergeCells(`A${totalRow.number}:G${totalRow.number}`);

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/complaint';
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

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataKeluhan-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }
}
