/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PdfService } from 'src/common/service/pdf.service';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { PAYMENT_TYPE } from 'src/order/enum/payment_type.enum';

@Injectable()
export class InvoicesRekonselPdfService {
  private readonly logger = new Logger(InvoicesRekonselPdfService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  private getInvoicesUploadPath(fileName?: string) {
    const folderPath = path.resolve(process.cwd(), 'uploads', 'invoices');
    fs.mkdirSync(folderPath, { recursive: true });

    return fileName ? path.join(folderPath, fileName) : folderPath;
  }

  async rekonselInvoices(id: number, res: Response) {
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
                include: {
                  quotation_receipt: true,
                  quotation_details: {
                    where: {
                      deleted_at: null
                    }
                  }
                },
              },
              store: true,
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
      ).value = `DATA REKONSEL ${data[0].invoices.vendor.company_name}`;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };



      // Definisikan kolom
      worksheet.columns = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Order Id', key: 'order_id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Nama Customer', key: 'member_name', width: 30 },
        { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
        {
          header: 'Tanggal \n Survey/Pengerjaan',
          key: 'survey_date',
          width: 20,
        },
        { header: 'Tagihan', key: 'invoice_price', width: 15 },
        {
          header: 'Transaksi \n Customer',
          key: 'customer_transaction',
          width: 20,
        },
        { header: 'Harga Jasa', key: 'instalation_price', width: 15 },
        { header: 'Selisih PPN', key: 'ppn_difference', width: 15 },
        { header: 'Margin PPN', key: 'margin_ppn', width: 15 },
        { header: 'Selisih', key: 'difference', width: 15 },
        { header: 'Selisih \n Non PPN', key: 'margin_non_ppn', width: 15 },
        { header: 'Margin', key: 'margin', width: 15 },
        { header: 'No Receipt', key: 'receipt_number', width: 20 },
        { header: 'Status \n Order', key: 'order_status', width: 30 },
      ];

      const headerRow = worksheet.addRow(
        worksheet.columns.map((col) => col.header),
      );
      headerRow.eachCell((cell) => {
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
      headerRow.height = 35;

      worksheet.getCell('A1').value = null;

      worksheet.getRow(1).eachCell((cell) => {
        cell.value = null;
      });

      const totals = {
        customer_transaction: 0,
        invoice_price: 0,
        instalation_price: 0,
        margin_ppn: 0,
        margin_non_ppn: 0,
        margin: 0,
        ppn: 0,
        price_difference: 0,
      };

      // Proses setiap order dalam data
      data.forEach((order, index) => {
        const toNumberMoney = (value: unknown) => {
          const parsed = Number(value ?? 0);
          return Number.isFinite(parsed) ? parsed : 0;
        };

        const calculateSurveyTotal = (quotationDetails, workStep) =>
          quotationDetails
            .filter(({ work_step }) => work_step === workStep)
            .reduce((total, { quotation_special_price }) => total + toNumberMoney(quotation_special_price), 0);

        const getCustomerTransaction = (order: any) => {
          const { payment_type: paymentType, grand_total: grandTotal, quotation } = order.order;
          const orderGrandTotal = toNumberMoney(grandTotal);
          const additionalFee = toNumberMoney(order.order.additional_fee);

          if (paymentType !== PAYMENT_TYPE.SURVEY) return orderGrandTotal + additionalFee;
          if (!quotation?.length) return additionalFee;

          const { quotation_grand_total: quotationGrandTotal, quotation_details: quotationDetails } = quotation[0];
          const quotationTotal = toNumberMoney(quotationGrandTotal);
          const surveyCalculators = {
            1: () => orderGrandTotal + additionalFee,
            2: () => quotationTotal + additionalFee,
            3: () => calculateSurveyTotal(quotationDetails, 1) + additionalFee,
            4: () => calculateSurveyTotal(quotationDetails, 2) + additionalFee,
            5: () => calculateSurveyTotal(quotationDetails, 3) + additionalFee,
          };

          return surveyCalculators[order.type]?.();
        };

        const customer_transaction = getCustomerTransaction(order);
        const invoice_price = toNumberMoney(order.total);
        const instalation_price =
          order.order.payment_type === 'gratis'
            ? 0
            : Math.floor(+customer_transaction / 1.11);
        const margin_ppn = instalation_price - invoice_price;
        const price_difference = +customer_transaction - invoice_price;
        const getReceiptNumber = (order: any) => {
          const { payment_type: paymentType, receipt_number: receiptNumber, quotation } = order.order;

          if (paymentType !== PAYMENT_TYPE.SURVEY || !quotation?.[0]) return receiptNumber || '-';

          const { receipt_quotation: receiptQuotation, quotation_receipt: quotationReceipt } = quotation[0];

          const receiptCalculators = {
            2: () => receiptQuotation || '-',
            3: () => quotationReceipt.find(({ quotation_step }) => quotation_step === 1)?.receipt_quotation,
            4: () => quotationReceipt.find(({ quotation_step }) => quotation_step === 2)?.receipt_quotation,
            5: () => quotationReceipt.find(({ quotation_step }) => quotation_step === 3)?.receipt_quotation,
          };

          return receiptCalculators[order.type]?.() || receiptNumber || '-';
        };
        const receipt_number = getReceiptNumber(order);
        const row = worksheet.addRow({
          no: index + 1,
          order_id: order.order_id,
          store_name: order.order.store.store_name,
          member_name: order.order.members.full_name,
          item_name: order.order.m_order_details
            .map((x) => x.item_name || '-')
            .join(', '),
          survey_date: order.order.request_work
            ? order.order.request_work
            : order.order.request_survey || '-',
          invoice_price: invoice_price,
          customer_transaction: +customer_transaction,
          instalation_price: instalation_price,
          ppn_difference: margin_ppn,
          margin_ppn: `${order.order.payment_type === 'gratis'
            ? -100
            : isNaN(margin_ppn / instalation_price)
              ? 0
              : Math.ceil((margin_ppn / instalation_price) * 100)
            }%`,
          difference: price_difference,
          margin_non_ppn:
            order.order.payment_type === 'gratis'
              ? -150000
              : Math.ceil(price_difference / 1.11),
          margin: `${order.order.payment_type === 'gratis'
            ? -100
            : isNaN(
              Math.ceil(
                (Math.ceil(price_difference / 1.11) /
                  +customer_transaction) *
                100,
              ),
            )
              ? 0
              : Math.ceil(
                (Math.ceil(price_difference / 1.11) / +customer_transaction) *
                100,
              )
            }%`,
          receipt_number: receipt_number || '-',
          order_status: order.order.status.description,
        });

        row.eachCell((cell, colNumber) => {
          // Menambahkan border ke semua sel
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };

          if (colNumber === 4) {
            cell.alignment = { horizontal: 'left' };
          } else {
            cell.alignment = { horizontal: 'left' };
          }
        });

        totals.customer_transaction += +customer_transaction;
        totals.invoice_price += invoice_price;
        totals.instalation_price += instalation_price;
        totals.margin_ppn += isNaN(margin_ppn) ? 0 : Math.ceil(margin_ppn);
        totals.margin_non_ppn +=
          order.order.payment_type === 'gratis'
            ? -150000
            : Math.ceil(price_difference / 1.11);
        totals.margin +=
          order.order.payment_type === 'gratis'
            ? -100
            : isNaN(
              Math.ceil(
                (Math.ceil(price_difference / 1.11) / +customer_transaction) *
                100,
              ),
            )
              ? 0
              : Math.ceil(
                (Math.ceil(price_difference / 1.11) / +customer_transaction) *
                100,
              );
        totals.ppn +=
          order.order.payment_type === 'gratis'
            ? -100
            : isNaN(margin_ppn / instalation_price)
              ? 0
              : Math.ceil((margin_ppn / instalation_price) * 100);
        totals.price_difference += price_difference;
      });

      const totalsRow = worksheet.addRow({
        no: 'Total',
        invoice_price: totals.invoice_price,
        customer_transaction: totals.customer_transaction,
        instalation_price: totals.instalation_price,
        ppn_difference: totals.margin_ppn,
        margin_ppn: `${Math.ceil(
          (totals.margin_ppn / totals.instalation_price) * 100,
        )}%`,
        difference: totals.price_difference,
        margin_non_ppn: totals.margin_non_ppn,
        margin: `${Math.ceil(
          (totals.margin_non_ppn / totals.customer_transaction) * 100,
        )}%`,
      });

      worksheet.mergeCells(`A${totalsRow.number}:E${totalsRow.number}`);
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

      // Fungsi untuk mendapatkan tanggal format saat ini
      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(now.getDate()).padStart(2, '0')}`;
      };

      // Fungsi untuk membuat path file Excel
      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/invoice/rekonsel';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      // Fungsi untuk menulis workbook dan mengirimkan respons
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

      // Generate file Excel
      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataRekonsel-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      // Jalankan pembuatan file Excel
      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while generating the invoice.');
    }
  }



  async invoicePdf(id: number, res: Response) {
    const invoices = await this.dbService.invoices.findFirst({
      where: {
        deleted_at: null,
        deleted_by: null,
        id: id,
      },
      include: {
        invoice_details: {
          include: {
            order: {
              include: {
                members: true,
                store: true,
                quotation: true,
              },
            },
          },
        },
        vendor: {
          include: {
            bank: true
          }
        },
      },
    });

    if (!invoices) {
      console.error('Quotation not found!');
      throw new NotFoundException('quotation not found!');
    }

    const data = {
      invoice: invoices,
    };

    const buffer = await this.pdfService.generate('invoice-pdf', data) as Buffer;
    const invoicePdfFileName = `${id}.pdf`;
    const invoicePdfPath = this.getInvoicesUploadPath(invoicePdfFileName);

    fs.writeFileSync(invoicePdfPath, buffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${invoicePdfFileName}`);
    res.send(buffer);
  }


  async rekonselPdf(id: number, res: Response) {
    const invoices = await this.dbService.invoices.findFirst({
      where: {
        deleted_at: null,
        deleted_by: null,
        id: id,
      },
      include: {
        invoice_details: {
          include: {
            order: {
              include: {
                m_order_details: true,
                members: true,
                store: true,
                quotation: true,
              },
            },
          },
        },
        vendor: {
          include: {
            bank: true
          }
        },
      },
    });

    if (!invoices) {
      console.error('Invoices not found!');
      throw new NotFoundException('Invoices not found!');
    }

    const data = {
      invoice: invoices,
    };

    const buffer = await this.pdfService.generateLandscape('rekonsel', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rekonsel.pdf');
    res.send(buffer);
  }


}
