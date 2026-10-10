/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { InvoiceStatus } from './dto/invoice-status.enum';

@Injectable()
export class InvoicesExportExcelService {
  constructor(private readonly dbService: PrismaService) {}

  async invoiceExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        search,
        date_from,
        date_to,
        vendor_id,
        monthly,
        status,
      } = queryParams;
      const now = new Date();
      if (monthly) now.setFullYear(monthly);
      const where: Prisma.invoicesWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  {
                    invoice_number: { contains: search },
                  },
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    invoice_details: {
                      some: {
                        order_id: !isNaN(+search) ? +search : undefined,
                      },
                    },
                  },
                  {
                    invoice_details: {
                      some: {
                        order: {
                          store: {
                            store_name: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(status
            ? [
              {
                status: {
                  in: status,
                },
              },
            ]
            : []),
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : undefined,
          vendor_id
            ? {
              vendor_id: vendor_id,
            }
            : undefined,
          monthly
            ? {
              created_at: {
                gte: new Date(now.getFullYear(), 0, 1),
                lte: new Date(now.getFullYear(), 11, 31),
              },
            }
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
      };
      const data = await this.dbService.invoices.findMany({
        where,
        include: {
          vendor: true,
          invoice_details: {
            where: {
              deleted_at: null,
            },
            include: {
              order: {
                include: {
                  members: true,
                  quotation: true,
                  store: true,
                },
              },
            },
          },
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Invoice', {
        properties: {
          tabColor: { argb: '097969' },
          outlineLevelCol: 2,
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

      worksheet.columns = [
        { header: 'Invoice Id', key: 'invoice_id', width: 10 },
        { header: 'Tanggal Invoice Terbit', key: 'created_at', width: 30 },
        { header: 'Nama Vendor', key: 'vendor_name', width: 25 },
        { header: 'Status', key: 'status', width: 60 },
        { header: 'Total Tagihan', key: 'total', width: 50 },
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

      data.forEach((order) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

        const row = worksheet.addRow({
          invoice_id: order.id,
          created_at: formattedDateTime(order.created_at),
          vendor_name: order.vendor.company_name,
          status: InvoiceStatus[order.status],
          total: Number(order.total_amount),
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

      const totalsRow = worksheet.addRow({
        invoice_id: 'Total',
        created_at: '',
        vendor_name: '',
        status: '',
        total: data.reduce((acc, order) => acc + Number(order.total_amount), 0),
      });

      worksheet.mergeCells(`A${totalsRow.number}:D${totalsRow.number}`);
      totalsRow.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/invoice';
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
        const baseName = `DataInvoice-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async invoiceDetailsExportExcel(id: number, res: Response) {
    try {
      const data = await this.dbService.invoice_details.findMany({
        where: {
          deleted_at: null,
          deleted_by: null,
          invoice_id: id,
        },
        include: {
          invoices: {
            include: { vendor: true },
          },
          order: {
            include: {
              status: true,
              quotation: {
                where: { deleted_at: null },
                include: { quotation_receipt: true },
              },
              sales: true,
              members: true,
              m_order_details: {
                where: { deleted_at: null },
                include: { item: true },
              },
            },
          },
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Invoice Rekonsel', {
        properties: {
          tabColor: { argb: '097969' },
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

      worksheet.mergeCells('A2: N3');

      worksheet.getCell(
        'A2',
      ).value = `DATA INVOICE ${data[0].invoices.vendor.company_name}`;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      // Cek nilai setelah diatur
      console.log(
        'Setelah pengaturan, nilai A1: ',
        worksheet.getCell('A2').value,
      );

      // Definisikan kolom
      worksheet.columns = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Order Id', key: 'order_id', width: 10 },
        { header: 'Tanggal Order', key: 'order_create', width: 30 },
        { header: 'Nama Konsumen', key: 'member_name', width: 30 },
        { header: 'Tipe Order', key: 'payment_type', width: 20 },
        { header: 'No. Receipt', key: 'no_receipt', width: 20 },
        { header: 'Total Harga', key: 'total', width: 20 },
      ];

      const headerRow = worksheet.addRow(
        worksheet.columns.map((col) => col.header),
      );
      headerRow.eachCell((cell) => {
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
      headerRow.height = 35;

      worksheet.getCell('A1').value = null;

      worksheet.getRow(1).eachCell((cell) => {
        cell.value = null;
      });

      // Proses setiap order dalam data
      data.forEach((order, index) => {
        const receipt_number = order.order.quotation[0]
          ? order.order.quotation[0].receipt_quotation || '-'
          : order.order.receipt_number || '-';

        const row = worksheet.addRow({
          no: index + 1,
          order_id: order.order_id,
          order_create: new Date(order.order.created_at).toLocaleDateString(
            'id-ID',
            { year: 'numeric', month: 'long', day: 'numeric' },
          ),
          member_name: order.order.members.full_name,
          payment_type: order.order.payment_type,
          no_receipt: receipt_number,
          total: Number(order.total),
        });

        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          cell.alignment = { horizontal: 'left' };
        });
      });

      const totalsRow = worksheet.addRow({
        no: 'Total',
        total: data.reduce((acc, curr) => acc + Number(curr.total), 0),
      });

      worksheet.mergeCells(`A${totalsRow.number}:F${totalsRow.number}`);
      totalsRow.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const totalPkp = worksheet.addRow({
        no: 'PPn (Vendor PKP)',
        total: Number(data[0].invoices.pkp_nominal),
      });

      worksheet.mergeCells(`A${totalPkp.number}:F${totalPkp.number}`);
      totalPkp.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalPkp.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const totalPph = worksheet.addRow({
        no: 'PPh',
        total: Number(data[0].invoices.pph_nominal),
      });

      worksheet.mergeCells(`A${totalPph.number}:F${totalPph.number}`);
      totalPph.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalPph.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const totalPenalty = worksheet.addRow({
        no: 'PPh',
        total: Number(data[0].invoices.penalty_nominal),
      });

      worksheet.mergeCells(`A${totalPenalty.number}:F${totalPenalty.number}`);
      totalPenalty.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalPenalty.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const grand_total = worksheet.addRow({
        no: 'PPh',
        total: Number(data[0].invoices.total_amount),
      });

      worksheet.mergeCells(`A${grand_total.number}:F${grand_total.number}`);
      grand_total.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      grand_total.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(now.getDate()).padStart(2, '0')}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/invoice/';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
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
        const baseName = `DataInvoiceDetailsId${id}-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while generating the invoice.');
    }
  }



  async templateInvoiceExcel(res: Response) {
    try {
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Template Invoice');

      worksheet.columns = [
        { header: 'Invoice ID', key: 'id', width: 35 },
        { header: 'Notes', key: 'notes', width: 45 },
      ];
      const dataFromDatabase = await this.dbService.invoices.findMany({
        where: {
          status: {
            in: [InvoiceStatus.INVOICE_DIBERIKAN_KEPADA_FINANCE],
          },
          deleted_at: null,
        },
      });

      dataFromDatabase.forEach((item) => {
        worksheet.addRow({
          id: item.id,
          notes: item.description,
        });
      });

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

      const saveWorkbookToFile = async (
        workbook: exceljs.Workbook,
        fileName: string,
      ) => {
        const folderPath = './storage/excel/template/invoice';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const filePath = path.join(folderPath, fileName);
        await workbook.xlsx.writeFile(filePath);
        return filePath;
      };

      const sendWorkbookAsResponse = async (
        workbook: exceljs.Workbook,
        filePath: string,
        res: Response,
      ) => {
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(filePath)}`,
        );

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      };

      const fileName = `TemplateExcelInvoice-${Date.now()}.xlsx`;
      const filePath = await saveWorkbookToFile(workbook, fileName);
      await sendWorkbookAsResponse(workbook, filePath, res);
    } catch (error) {
      throw error;
    }
  }


}
