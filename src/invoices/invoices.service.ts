import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, invoices, status, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { MulterError } from 'multer';
import { throws } from 'assert';
import { curry } from 'lodash';
import { objectEnumValues } from '@prisma/client/runtime/library';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceStatus } from './dto/invoice-status.enum';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService) {}
  private readonly logger = new Logger(InvoicesService.name);
  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;

      // Prepare evidences if available
      const evidences = invoice_evidences?.length
        ? invoice_evidences.map((item) => ({
            evidence_location: item.filename,
            created_by: user_id,
          }))
        : [];

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: createInvoiceDto.vendor_id,
        },
      });

      // Get provided order IDs
      const providedOrder = createInvoiceDto.invoice_details
        ? createInvoiceDto.invoice_details.map(({ order_id }) =>
            Number(order_id),
          )
        : [];

      if (providedOrder.length === 0) {
        this.logger.error('No Order Id Provided');
        throw new Error('No Order Id Provided');
      }

      const orders = await this.dbService.orders.findMany({
        where: {
          id: {
            in: providedOrder,
          },
          invoice_details: {
            none: {},
          },
          work_orders: {
            status: {
              category: {
                in: ['WORKEND', 'DONE'],
              },
            },
          },
        },
        include: {
          m_order_details: true,
          quotation: true,
          work_orders: true,
          invoice_details: {
            select: {
              id: true,
            },
          },
        },
      });
      console.log(orders);

      if (
        orders.filter((order) => order.payment_type === 'gratis').length !== 0
      ) {
        throw new BadRequestException(
          'Order yang di input tidak boleh dengan payment type GRATIS',
        );
      }

      if (orders.filter((order) => !order?.work_orders).length !== 0) {
        throw new BadRequestException(
          'Status order yang dipilih saat ini masih belum selesai',
        );
      }

      if (
        orders.filter((order) => order.invoice_details.length !== 0).length !==
        0
      ) {
        throw new BadRequestException(
          'Beberapa order yang dipilih sudah dirilis Invoice-nya',
        );
      }

      let totalGrandTotal = 0;
      let totalQuotationGrandTotal = 0;
      let invoiceDetails = [];

      orders.forEach((order) => {
        if (order?.payment_type === 'survey') {
          if (order.quotation && order.quotation.length > 0) {
            const quotationTotal = order.quotation.reduce((acc, quotation) => {
              invoiceDetails.push({
                order_id: order.id,
                total: quotation.quotation_grand_total,
              });
              return acc + (Number(quotation.quotation_grand_total) || 0);
            }, 0);
            totalQuotationGrandTotal += quotationTotal;
          }
        } else if (order?.payment_type === 'pemasangan_tanpa_survey') {
          invoiceDetails.push({
            order_id: order.id,
            total: order.grand_total,
          });
          totalGrandTotal += Number(order.grand_total) || 0;
        }
      });

      const totalAmount =
        totalGrandTotal +
        totalQuotationGrandTotal +
        Number(vendor.nominal_survey);

      const invoicesCount = (await this.dbService.invoices.count()) + 1;

      console.log(invoiceDetails, 'DETAILS');

      const data = {
        vendor: {
          connect: {
            id: vendor.id,
          },
        },
        status: createInvoiceDto.status,
        invoice_number: `${invoicesCount}`,
        total_amount: totalAmount,
        invoice_evidence: {
          createMany: {
            data: evidences,
          },
        },
        ...(invoiceDetails.length > 0
          ? {
              invoice_details: {
                createMany: {
                  data: invoiceDetails,
                },
              },
            }
          : {}),
        created_by: user_id,
      };

      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.create({ data }),
        this.dbService.orders.updateMany({
          where: { id: { in: providedOrder } },
          data: { project_status_id: 20 },
        }),
      ]);

      await this.invoiceLogs(invoices.id, invoices);
      this.logger.log(`Invoice successfully create with ID: ${invoices.id}`);
      return invoices;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        order_by,
        vendor_id,
        monthly,
        status,
        invoice_status,
      } = query;
      const skip = page * take - take;
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
                  ],
                },
              ]
            : []),
          ...(invoice_status
            ? [
                {
                  status: invoice_status,
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
                vendor_id: {
                  equals: vendor_id,
                },
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
      const invoices = await this.dbService.invoices.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          invoice_evidence: true,
          vendor: true,
          invoice_details: {
            include: {
              order: {
                include: {
                  members: true,
                },
              },
            },
          },
        },
      });
      const grandTotalAmount = invoices.reduce(
        (acc, curr) => acc + Number(curr.total_amount),
        0,
      );

      const total = await this.dbService.invoices.count({
        where,
      });

      return {
        data: invoices,
        meta: {
          grandTotalAmount,
          skip,
          page,
          take,
          total,
          takeTotal: invoices.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const invoice = await this.dbService.invoices.findFirst({
        where: {
          id,
        },
        include: {
          invoice_evidence: true,
          vendor: true,
          invoice_details: {
            include: {
              order: {
                include: {
                  quotation: true,
                  members: true,
                },
              },
            },
          },
        },
        // include: {
        //   order: {
        //     include: {
        //       complaints: true,
        //       m_order_details: true,
        //       status: true,
        //       quotation: true,
        //       work_orders: {
        //         include: {
        //           work_order_status: {
        //             include: {
        //               status: true,
        //             },
        //           },
        //           work_order_evidences: true,
        //           work_order_tukang: {
        //             include: {
        //               tukang: true,
        //             },
        //           },
        //         },
        //       },
        //       vendor: true,
        //     },
        //   },
        // },
      });

      return invoice;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateInvoiceDto: UpdateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;

      const invoice = await this.dbService.invoices.findFirstOrThrow({
        where: { id },
        include: {
          invoice_details: {
            where: { deleted_at: null },
            include: { order: true },
          },
        },
      });

      if (!invoice) {
        this.logger.error('Invoice id not found');
        throw new NotFoundException(`Invoice not found with id ${id}`);
      }

      const evidences =
        invoice_evidences?.map((item) => ({
          evidence_location: item.filename,
          created_by: user_id,
        })) || [];

      const providedOrderIds =
        updateInvoiceDto.invoice_details?.map(({ order_id }) =>
          Number(order_id),
        ) || [];
      if (providedOrderIds.length === 0) {
        this.logger.error('No Order Id Provided');
        throw new Error('No Order Id Provided');
      }

      const orders = await this.dbService.orders.findMany({
        where: { id: { in: providedOrderIds } },
        include: { m_order_details: true, quotation: true },
      });

      let totalAmount = 0;
      const invoiceDetails = updateInvoiceDto.invoice_details.map((item) => {
        const order = orders.find((order) => order.id === item.order_id);
        let total = 0;
        if (order) {
          if (order.payment_type === 'survey') {
            order.quotation.forEach((quotation) => {
              total = Number(quotation.quotation_grand_total) || 0;
              totalAmount += total;
            });
          } else if (order.payment_type === 'pemasangan_tanpa_survey') {
            total = Number(order.grand_total) || 0;
            totalAmount += total;
          }
        }

        return {
          where: { id: item.id ?? 0 },
          create: {
            order: { connect: { id: item.order_id } },
            total,
            created_by: user_id,
          },
          update: {
            order_id: item.order_id,
            total,
            updated_at: new Date(),
            updated_by: user_id,
          },
        };
      });

      const invoiceData = {
        total_amount: totalAmount,
        status: updateInvoiceDto.status,
        invoice_evidence: { createMany: { data: evidences } },
        invoice_details: { upsert: invoiceDetails },
        updated_at: new Date(),
        updated_by: user_id,
      };

      const detailsIds = updateInvoiceDto.invoice_details
        ? updateInvoiceDto.invoice_details
            .filter((x) => Boolean(x?.id))
            .map((item) => item?.id)
        : undefined;

      const [syncFiles, syncDetails, updatedInvoice] =
        await this.dbService.$transaction([
          this.dbService.invoice_evidence.updateMany({
            where: {
              invoice_id: invoice.id,
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.invoice_details.updateMany({
            where: {
              ...(detailsIds && detailsIds.length
                ? {
                    id: {
                      notIn: detailsIds,
                    },
                  }
                : undefined),
              invoice_id: invoice.id,
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.invoices.update({
            where: { id: invoice.id },
            data: invoiceData,
          }),
        ]);

      this.logger.log(`Invoice successfully update with ID ${invoice.id} `);
      await this.invoiceLogs(invoice.id, updatedInvoice);
      return updatedInvoice;
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const { id: user_id } = user;
      const invoice = await this.dbService.invoices.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return invoice;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // async setStatus(invoice: invoices, status_id: number, user: users) {
  //   try {
  //     const statuses = await this.dbService.status.findMany();
  //     let newStatus = statuses.find((i) =>
  //       i.category.toLowerCase().includes('unpaid'),
  //     );

  //     const role = await this.dbService.roles.findFirst({
  //       where: {
  //         id: user.role_id,
  //       },
  //     });

  //     if (role.name.toLowerCase() === 'admin ho') {
  //       newStatus = statuses.find((i) =>
  //         i.category.toLowerCase().includes('pending'),
  //       );

  //       if (
  //         invoice.status_id ===
  //           statuses.find((x) => x.category.toLowerCase().includes('pending'))
  //             .id &&
  //         status_id ===
  //           statuses.find((x) => x.category.toLowerCase().includes('paid')).id
  //       ) {
  //         newStatus = statuses.find((i) =>
  //           i.category.toLowerCase().includes('paid'),
  //         );
  //       }

  //       if (
  //         invoice.status_id ===
  //           statuses.find((x) => x.category.toLowerCase().includes('pending'))
  //             .id &&
  //         status_id ===
  //           statuses.find((x) => x.category.toLowerCase().includes('rejected'))
  //             .id
  //       ) {
  //         newStatus = statuses.find((i) =>
  //           i.category.toLowerCase().includes('rejected'),
  //         );
  //       }
  //     }

  //     await this.dbService.invoices.update({
  //       where: {
  //         id: invoice.id,
  //       },
  //       data: {
  //         status: {
  //           connect: {
  //             id: newStatus.id,
  //           },
  //         },
  //       },
  //     });
  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

  async nextCode() {
    const invoices = await this.dbService.invoices.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return invoices[0] || null;
  }

  async updateInvoicesPayment(dto: UpdateInvoiceDto) {
    try {
      const request = {
        where: {
          id: {
            in: dto.invoice_id,
          },
        },
        data: {
          status: dto.status,
        },
      };
      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.updateMany(request),
      ]);
      return invoices;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async invoiceExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Invoice', {
        properties: {
          tabColor: {
            argb: '097969',
          },
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
        { header: 'Invoice Id', key: 'id', width: 10 },
        { header: 'Order Id', key: 'order_id', width: 25 },
        { header: 'Nama Customer', key: 'member_name', width: 50 },
        { header: 'Jenis Pengerjaan', key: 'payment_type', width: 50 },
        { header: 'Nomor Receipt', key: 'receipt_number', width: 60 },
        { header: 'Vendor ID', key: 'vendor_id', width: 50 },
        { header: 'Nama Vendor', key: 'vendor_name', width: 50 },
        { header: 'Nomor Invoice', key: 'invoice_number', width: 50 },
        { header: 'Total Invoice', key: 'total_amount', width: 50 },
        { header: 'Invoice Dibuat ', key: 'created_at', width: 30 },
        { header: 'Notes', key: 'description', width: 50 },
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

      data.forEach((invoice) => {
        const invoiceOrder = invoice.invoice_details
          ? invoice.invoice_details
              .map((item) => item?.order_id || 'N/a')
              .join(', ')
          : 'N/a';
        const invoiceOrderCustomer = invoice.invoice_details
          ? invoice.invoice_details
              .map((item) => item?.order.members.full_name || 'N/a')
              .join(', ')
          : 'N/a';
        const invoiceOrderReceiptNumber = invoice.invoice_details
          ? invoice.invoice_details
              .map((item) => item?.order.receipt_number || 'N/a')
              .join(', ')
          : 'N/a';
        const invoiceOrderPaymentType = invoice.invoice_details
          ? invoice.invoice_details
              .map((item) => item?.order.payment_type || 'N/a')
              .map((paymentType) => {
                switch (paymentType) {
                  case 'pemasangan_tanpa_survey':
                    return 'Pemasangan Tanpa Survey';
                  case 'survey':
                    return 'Survey';
                  case 'gratis':
                    return 'Gratis';
                  default:
                    return 'N/a';
                }
              })
              .join(', ')
          : 'N/a';
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const grandTotal = Number(invoice.total_amount);
        const formattedGrandTotal = !isNaN(grandTotal)
          ? new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
            }).format(grandTotal)
          : 'Rp. 0';
        const row = worksheet.addRow({
          id: invoice.id,
          order_id: invoiceOrder,
          member_name: invoiceOrderCustomer,
          payment_type: invoiceOrderPaymentType,
          receipt_number: invoiceOrderReceiptNumber,
          vendor_id: invoice.vendor ? invoice.vendor_id : 'N/a',
          vendor_name: invoice.vendor ? invoice.vendor.company_name : 'N/a',
          invoice_number: invoice.invoice_number,
          total_amount: formattedGrandTotal,
          created_at: formattedDateTime(invoice.created_at),
          description: invoice.description ? invoice.description : 'N/a',
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

  async syncInvoiceFromExcel(file: Express.Multer.File) {
    try {
      const filePath = file.path;
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.worksheets[0];

      const invoiceUpdates = [];
      let updatedInvoiceCount = 0;

      for (let i = 2; i <= sheet.actualRowCount; i++) {
        const row = sheet.getRow(i);
        const invoiceId = row.getCell(1).value as number;
        const note = row.getCell(11).value;
        console.log(note);

        if (invoiceId != null) {
          if (typeof note === 'string') {
            await this.updateInvoiceWithNotes(invoiceId, note);
            invoiceUpdates.push(invoiceId);
            updatedInvoiceCount++;
          }
        }
      }

      return updatedInvoiceCount;
    } catch (error) {
      throw error;
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
            in: [InvoiceStatus.WAITING_FOR_PAYMENT],
          },
          deleted_at: null
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

  async invoiceLogs(invoice_id: number, data: any) {
    await this.dbService.invoice_logs.create({
      data: {
        invoice: {
          connect: {
            id: invoice_id,
          },
        },
        data: JSON.stringify(data ?? {}),
      },
    });
  }

  private async updateInvoiceWithNotes(invoiceId: number, note: string) {
    try {
      await this.dbService.invoices.update({
        where: { id: invoiceId },
        data: { description: note, status: InvoiceStatus.PAID },
      });
    } catch (error) {
      this.logger.error(
        `Error updating invoice with ID ${invoiceId} with note: ${note}`,
        error,
      );
      throw error;
    }
  }
}
