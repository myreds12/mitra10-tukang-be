/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberExportService {
  constructor(private readonly dbService: PrismaService) {}

  //FIXME: FIX JIKA PRISMA SUDAH LIMIT
  async memberExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { search, date_from, date_to, store_id, top_best } = queryParams;
      const where: Prisma.membersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { whatsapp_number: { contains: search } },
                  { member_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(store_id
            ? [{ join_location_store: { id: { in: store_id } } }]
            : []),
          // ...(date_from && date_to
          //   ? [
          //       {
          //         created_at: {
          //           gte: new Date(date_from),
          //           lte: new Date(`${date_to}T23:59:59.000Z`),
          //         },
          //       },
          //     ]
          //   : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.members.count({ where });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i <= countTake; i++) {
        skipData = i * takeData;
        const members = await this.dbService.members.findMany({
          where,
          skip: skipData,
          take: takeData,
          include: {
            join_location_store: true,
            area: true,
            order: {
              where: {
                ...(date_from && date_to
                  ? {
                    created_at: {
                      gte: new Date(date_from),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                    },
                  }
                  : {}),
              },
              include: {
                quotation: true,
                complaints: true,
                status: true,
                store: true,
                sales: true,
                m_order_details: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        });

        if (Boolean(top_best)) {
          members.sort((a, b) => b.order.length - a.order.length);
        }

        const dataBatch = members.map((item) => {
          const totalUnpaid = item.order
            .filter((order) =>
              order?.quotation[0]?.receipt_quotation === null
            )
            .reduce((total, order) => total + Number(order.grand_total), 0);

          const totalPaid = item.order
            .filter(
              (order) =>
                order?.quotation[0]?.receipt_quotation !== null
            )
            .reduce((total, order) => total + Number(order.grand_total), 0);

          const comparisonPaidUnpaid = totalPaid - totalUnpaid;

          return {
            ...item,
            total_order: item.order.length,
            total_unpaid: totalUnpaid,
            total_paid: totalPaid,
            comparison_paid_unpaid: comparisonPaidUnpaid,
          };
        });

        dataExcel = [...dataExcel, ...dataBatch];
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Member ', {
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
        { header: 'Member Id', key: 'id', width: 20 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Customers', key: 'full_name', width: 35 },
        { header: 'Join Date', key: 'join_date', width: 35 },
        { header: 'Email Member', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Whatsapp Number', key: 'whatsapp_number', width: 35 },
        { header: 'Member Number', key: 'member_number', width: 35 },
        { header: 'Alamat', key: 'address', width: 50 },
        { header: 'Total Order', key: 'total_order', width: 35 },
        { header: 'Total Unpaid', key: 'total_unpaid', width: 35 },
        { header: 'Total Paid', key: 'total_paid', width: 35 },
        {
          header: 'Comparison Paid-Unpaid',
          key: 'comparison_paid_unpaid',
          width: 35,
        },
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
      const formattedDateTime = (dateTime) =>
        `${new Date(dateTime).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;

      dataExcel.forEach((member) => {
        const row = worksheet.addRow({
          id: member.id,
          store_name: member.join_location_store
            ? member.join_location_store.store_name
            : '',
          full_name: member.full_name ? member.full_name : '',
          join_date: member.join_date
            ? formattedDateTime(member.join_date)
            : '',
          email: member.email ? member.email : '',
          phone_number: member.phone_number ? member.phone_number : '',
          whatsapp_number: member.whatsapp_number ? member.whatsapp_number : '',
          member_number: member.member_number,
          address: member.address_1 ? member.address_1 : member.address_2,
          total_order: member.total_order,
          total_unpaid: member.total_unpaid,
          total_paid: member.total_paid,
          comparison_paid_unpaid: member.comparison_paid_unpaid,
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

      const createExcelFilePath = (baseName) => {
        const folderPath = './storage/excel/member';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const excelFileName = `${baseName}.xlsx`;
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

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const generateExcelFile = async (data, res) => {
        const baseName = `DataMember-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(dataExcel, res);
    } catch (error) {
      throw error;
    }
  }
}
