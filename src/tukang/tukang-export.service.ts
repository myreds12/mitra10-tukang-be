/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PdfService } from 'src/common/service/pdf.service';

@Injectable()
export class TukangExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async tukangExportExcel(res: Response, data: any[]) {
    try {

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
        { header: 'Tukang Id', key: 'id', width: 20 },
        { header: 'Nama Vendor', key: 'company_name', width: 35 },
        { header: 'Nama Tukang', key: 'full_name', width: 35 },
        { header: 'Alamat', key: 'address', width: 35 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Tanggal Lahir', key: 'bod', width: 35 },
        { header: 'Nomor KTP', key: 'ktp_number', width: 35 },
        { header: 'Username', key: 'username', width: 35 },
        { header: 'Tanggal Bergabung', key: 'join_date', width: 50 },
        { header: 'Service Type', key: 'tukang_service', width: 50 },
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

      data.forEach((tukang) => {
        const formattedDateTime = (date) =>
          `${date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const tukangService = tukang.tukang_service
          ? tukang.tukang_service
              .map((service) => service.service_type.service_type)
              .join(',')
          : '';
        const row = worksheet.addRow({
          id: tukang.id,
          company_name: tukang.vendor ? tukang.vendor.company_name : '',
          full_name: tukang.full_name ? tukang.full_name : '',
          address: tukang.address ? tukang.address : '',
          email: tukang.email ? tukang.email : '',
          phone_number: tukang.phone_number ? tukang.phone_number : '',
          bod: tukang.bod ? formattedDateTime(new Date(tukang.bod)) : '',
          ktp_number: tukang.ktp_number ? tukang.ktp_number : '',
          username: tukang.users ? tukang.users.username : '',
          join_date: tukang.join_date
            ? formattedDateTime(new Date(tukang.join_date))
            : formattedDateTime(new Date(tukang.created_at)),
          tukang_service: tukangService,
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

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './uploads/excel/tukang';
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

      const generateExcelFile = async (data, res) => {
        const baseName = `DataTukang-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }

  async tukangOrderPdf(res: Response, queryParams: QueryParamsDto) {
    const { tukang_id, vendor_id, date_from, date_to, order_by } = queryParams;
    const where: Prisma.work_order_tukangWhereInput = {
      AND: [
        vendor_id
          ? {
              work_orders: {
                vendor_id: vendor_id,
              },
            }
          : undefined,
        tukang_id
          ? {
              tukang_id: tukang_id,
            }
          : undefined,
        date_from && date_to
          ? {
              work_orders: {
                order: {
                  created_at: {
                    gte: new Date(`${date_from}T00:00:00.000Z`),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                },
              },
            }
          : undefined,
      ].filter(Boolean),
      deleted_at: null,
    };
    const tukang = await this.dbService.work_order_tukang.findMany({
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        tukang: true,
        work_orders: {
          include: {
            order: {
              include: {
                status: true,
                store: true,
                members: true,
                m_order_details: true,
              },
            },
          },
        },
      },
    });

    const data = {
      tukang,
    };

    // Convert logo to base64 for PDF rendering
    // html-pdf (PhantomJS) cannot reliably load external HTTPS URLs
    const mitra10LogoBase64 = this.pdfService.getImageAsBase64(
      path.join(process.cwd(), 'templates', 'public', 'img', 'logo-mitra.png'),
    );

    const dataWithLogo = {
      ...data,
      mitra10LogoBase64,
    };

    console.log(data.tukang);

    const buffer = await this.pdfService.generate('tukang-pdf', dataWithLogo);
    // Set headers to download the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=quotation.pdf');
    res.send(buffer);
  }

  async tukangExportOrderExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { tukang_id, vendor_id, date_from, date_to } = queryParams;
      const where: Prisma.work_order_tukangWhereInput = {
        AND: [
          vendor_id
            ? {
                work_orders: {
                  vendor_id: vendor_id,
                },
              }
            : undefined,
          tukang_id
            ? {
                tukang_id: tukang_id,
              }
            : undefined,
          date_from && date_to
            ? {
                work_orders: {
                  order: {
                    created_at: {
                      gte: new Date(`${date_from}T00:00:00.000Z`),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                    },
                  },
                },
              }
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
      };
      const data = await this.dbService.work_order_tukang.findMany({
        where,
        include: {
          tukang: true,
          work_orders: {
            include: {
              order: {
                include: {
                  status: true,
                  store: true,
                  members: true,
                  m_order_details: true,
                },
              },
            },
          },
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order Tukang ', {
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
        { header: 'Order Id', key: 'id', width: 20 },
        { header: 'Tanggal Order', key: 'order_created', width: 35 },
        { header: 'Nama Customer', key: 'member_name', width: 35 },
        { header: 'Jenis Pemasangan', key: 'item_name', width: 35 },
        { header: 'Status Order', key: 'order_status', width: 35 },
        { header: 'Notes', key: 'notes', width: 35 },
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

      data.forEach((tukang) => {
        const formattedDateTime = (date) =>
          `${date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const row = worksheet.addRow({
          id: tukang.work_orders.order_id,
          order_created: tukang.work_orders.order.created_at
            ? formattedDateTime(tukang.work_orders.order.created_at)
            : '',
          member_name: tukang.work_orders.order.members.full_name
            ? tukang.work_orders.order.members.full_name
            : '',
          item_name: tukang.work_orders.order.m_order_details
            ? tukang.work_orders.order.m_order_details
                .map((item) => item?.item_name || '-')
                .join(', ')
            : 'Jenis Jasa Pemasangan Belum Ditentukan',
          order_status: tukang.work_orders.order.status.description
            ? tukang.work_orders.order.status.description
            : '',
          notes: tukang.notes ? tukang.notes : 'Notes Belum Ditentukan',
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

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './uploads/excel/tukang-order';
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

      const generateExcelFile = async (data, res) => {
        const baseName = `DataTukang-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }

}
