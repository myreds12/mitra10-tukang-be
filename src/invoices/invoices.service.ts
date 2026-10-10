/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceStatus } from './dto/invoice-status.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { PAYMENT_TYPE } from 'src/order/enum/payment_type.enum';
import { PdfService } from 'src/common/service/pdf.service';
import { InvoicesExportExcelService } from './invoices-export-excel.service';
import { InvoicesRekonselPdfService } from './invoices-rekonsel-pdf.service';
import { InvoicesQueryService } from './invoices-query.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly dbService: PrismaService,
    private notifService: NotificationsService,
    private pdfService: PdfService,
    private readonly exportExcelService: InvoicesExportExcelService,
    private readonly rekonselPdfService: InvoicesRekonselPdfService,
    private readonly queryService: InvoicesQueryService,
  ) {}

  private getInvoicesUploadPath(fileName?: string) {
    const folderPath = path.resolve(process.cwd(), 'uploads', 'invoices');
    fs.mkdirSync(folderPath, { recursive: true });

    return fileName ? path.join(folderPath, fileName) : folderPath;
  }

  async invoiceLogs(invoice_id: number, data: any) {
    return this.queryService.invoiceLogs(invoice_id, data);
  }

  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: users,
    invoice_evidences?: Array<Express.Multer.File>,
  ) {
    try {
      const { id: user_id } = user;

      const evidences = invoice_evidences?.length
        ? invoice_evidences.map((item) => ({
          evidence_location: item.filename,
          created_by: user_id,
        }))
        : [];

        const refund = await this.dbService.refund.findMany({
        where: {
          orders: {
            vendor_id: createInvoiceDto.vendor_id,
          },
          paid_status: 0,
          
        },
      });


      const penaltyNominal = refund.length > 0 ? refund?.reduce(
        (acc, curr) => acc + Number(curr?.penalty_nominal),
        0,
      ): 0

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: createInvoiceDto.vendor_id,
        },
      });

      const providedOrder = createInvoiceDto.invoice_details
        ? [...new Set(createInvoiceDto.invoice_details.map(({ order_id }) => Number(order_id)))]
        : [];

      if (providedOrder.length === 0) {
        this.logger.error('No Order Id Provided');
        throw new Error('No Order Id Provided');
      }

      const existingInvoiceDetails = await this.dbService.invoice_details.findMany({
        where: {
          order_id: {
            in: providedOrder,
          },
          invoices: {
            status: {
              notIn: [
                InvoiceStatus.INVOICE_DITOLAK,
                InvoiceStatus.DOKUMEN_DITOLAK,
              ],
            }
          }
        },
        select: {
          order_id: true,
          type: true,
        },
      });

      const existingCombinationSet = new Set(
        existingInvoiceDetails.map((item) => `${item.order_id}-${item.type}`)
      );

      for (const detail of createInvoiceDto.invoice_details) {
        const key = `${detail.order_id}-${detail.type}`;
        if (existingCombinationSet.has(key)) {
          this.logger.error(`Invoice untuk Order ID ${detail.order_id} dengan tipe ${detail.type} sudah ada`);
          throw new BadRequestException(`Invoice untuk Order ID ${detail.order_id} dan tipe tersebut sudah pernah dibuat`);
        }
      }

      const orders = await this.dbService.orders.findMany({
        where: {
          id: {
            in: providedOrder,
          },
        },
        include: {
          m_order_details: {
            where: { deleted_at: null },
            include: { item: true },
          },
          quotation: {
            where: { deleted_at: null },
            include: {
              quotation_details: {
                where: { deleted_at: null },
              },
            },
          },
          work_orders: true,
          invoice_details: {
            select: { id: true },
          },
        },
      });

      let totalGrandTotal = 0;
      const invoiceDetails = [];

      const formatDateToMonthYear = (dateString) => {
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}${year}`;
      };

      orders.forEach((order) => {
        createInvoiceDto.invoice_details?.forEach((detail) => {
          if (detail.order_id === order.id) {
            const isDuplicate = invoiceDetails.some(
              (item) => item.order_id === order.id && item.type === detail.type
            );

            if (!isDuplicate) {
              const quotationTotal = order?.quotation[0]?.quotation_details.reduce(
                (acc, curr) => acc + Number(curr.final_price),
                0
              ) || 0;

              let totalMargin = 0;

              if (order.payment_type === 'survey') {
                switch (detail.type) {
                  case 1:
                    totalMargin = (vendor.nominal_survey ? Number(vendor.nominal_survey) : 75000) +
                      Number(order.additional_fee);
                    break;
                  case 2:
                    totalMargin =
                      vendor.margin_type === 1
                        ? (+vendor.margin_nominal / 100) * quotationTotal
                        : quotationTotal + +vendor.margin_nominal + Number(order.additional_fee);
                    break;
                  case 3:
                    totalMargin =
                      (vendor.margin_type === 1
                        ? ((+vendor.margin_nominal / 100) * quotationTotal * 25) / 100
                        : quotationTotal + +vendor.margin_nominal) + Number(order.additional_fee);
                    break;
                  case 4:
                    totalMargin =
                      (vendor.margin_type === 1
                        ? ((+vendor.margin_nominal / 100) * quotationTotal * 50) / 100
                        : quotationTotal + +vendor.margin_nominal) + Number(order.additional_fee);
                    break;
                  case 5:
                    totalMargin =
                      (vendor.margin_type === 1
                        ? ((+vendor.margin_nominal / 100) * quotationTotal * 25) / 100
                        : quotationTotal + +vendor.margin_nominal) + Number(order.additional_fee);
                    break;
                }
              } else if (order.payment_type === 'pemasangan_tanpa_survey') {
                totalMargin =
                  (vendor.margin_type === 1
                    ? order.m_order_details
                      .filter((i) => i.item.type === 2)
                      .reduce((acc, curr) => acc + Number(curr?.item?.invoice_nominal || 0) * Number(curr?.quantity || 0), 0)
                    : +vendor.margin_nominal *
                    order.m_order_details
                      .filter((i) => i.item.type === 2)
                      .reduce((acc, curr) => acc + Number(curr?.quantity || 0), 0)) +
                  Number(order.additional_fee);
              } else if (order.payment_type === 'gratis') {
                totalMargin =
                  order.m_order_details
                    .filter((i) => i.item.type === 1)
                    .reduce((acc, curr) => acc + Number(curr?.item?.invoice_nominal || 0) * Number(curr?.quantity || 0), 0) +
                  Number(order.additional_fee);
              }

              // Validasi safety net: jika totalMargin > grand_total, kemungkinan invoice_nominal salah
              if (totalMargin > Number(order.grand_total)) {
                this.logger.warn(
                  `⚠️ Order ${order.id}: invoice_price (${totalMargin}) > grand_total (${order.grand_total}). Kemungkinan invoice_nominal item salah atau tidak sesuai dengan harga vendor.`,
                );
              }

              invoiceDetails.push({
                order_id: order.id,
                total: totalMargin,
                invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                type: detail.type,
              });

              totalGrandTotal += totalMargin || 0;
            }
          }
        });
      });

      const pkpNominal = vendor.type === 1 ? totalGrandTotal * (+vendor.pkp_nominal / 100) : 0;
      const pphNominal = createInvoiceDto.pph_nominal
        ? totalGrandTotal * (+createInvoiceDto.pph_nominal / 100)
        : 0;
      const ppnNominal = createInvoiceDto.ppn_nominal
        ? totalGrandTotal * (+createInvoiceDto.ppn_nominal / 100)
        : 0;

      const totalAmount = totalGrandTotal + pkpNominal + pphNominal + ppnNominal;
      const invoicesCount = (await this.dbService.invoices.count()) + 1;

      const data = {
        vendor: { connect: { id: vendor.id } },
        pkp_nominal: pkpNominal,
        pph_nominal: pphNominal,
        ppn_nominal: ppnNominal,
        penalty_nominal: penaltyNominal,
        status: createInvoiceDto.status,
        invoice_number: `${invoicesCount}`,
        total_amount: totalAmount,
        invoice_evidence: {
          createMany: { data: evidences },
        },
        ...(invoiceDetails.length > 0
          ? {
            invoice_details: {
              createMany: { data: invoiceDetails },
            },
          }
          : {}),
        created_by: user_id,
      };

      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.create({ data }),
      ]);

      if (invoices) {
        await this.notifService.create(
          { invoices },
          'CREATE',
          invoices.created_by,
          moduleTypeNotification.INVOICE,
          invoices.id,
          invoices.status,
        );
      }

      await this.invoiceLogs(invoices.id, invoices);
      this.logger.log(`Invoice successfully created with ID: ${invoices.id}`);
      return invoices;
    } catch (error) {
      console.error('Error creating invoice:', error);
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
          vendor: true,
          invoice_details: {
            where: { deleted_at: null },
            include: { order: true },
          },
        },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice not found with id ${id}`);
      }

      const evidences =
        invoice_evidences?.map((item) => ({
          evidence_location: item.filename,
          created_by: user_id,
        })) || [];

      const providedOrderIds =
        updateInvoiceDto?.invoice_details?.map(({ order_id }) =>
          Number(order_id),
        ) || [];

      const orders = providedOrderIds.length > 0
        ? await this.dbService.orders.findMany({
          where: { id: { in: providedOrderIds } },
          include: {
            m_order_details: {
              where: { deleted_at: null },
              include: { item: true },
            },
            quotation: {
              where: { deleted_at: null },
              include: {
                quotation_details: {
                  where: { deleted_at: null },
                },
              },
            },
            work_orders: true,
          },
        })
        : [];

      const refund = await this.dbService.refund.findMany({
        where: {
          orders: {
            vendor_id: invoice.vendor.id,
          },
          paid_status: 0,
        },
      });


      const penaltyNominal = refund.length > 0 && updateInvoiceDto.status === InvoiceStatus.INVOICE_DISETUJUI ? refund?.reduce(
        (acc, curr) => acc + Number(curr?.penalty_nominal),
        0,
      ) : invoice.penalty_nominal;



      let totalGrandTotal = invoice.invoice_details.reduce((acc, curr) => {
        return acc + Number(curr.total);
      }, 0);

      const orderMap = new Map(orders.map(order => [order.id, order]));

      const invoiceDetails = updateInvoiceDto?.invoice_details?.map((item) => {
        const order = orderMap.get(item.order_id);

        let total = 0;

        if (order) {
          if (order.payment_type === 'survey' && item.type === 1) {
            total = (invoice.vendor.nominal_survey
              ? Number(invoice.vendor.nominal_survey)
              : 75000);
          } else if (order.payment_type === 'survey' && item.type === 2) {
            total =
              (invoice.vendor.margin_type === 1
                ? (+invoice.vendor.margin_nominal / 100) *
                Number(
                  order?.quotation[0]?.quotation_details.reduce(
                    (acc, curr) => acc + Number(curr.final_price),
                    0,
                  ),
                )
                : Number(
                  order?.quotation[0]?.quotation_details.reduce(
                    (acc, curr) => acc + Number(curr.final_price),
                    0,
                  ),
                ) - +invoice.vendor.margin_nominal) +
              Number(order.additional_fee);
          } else if (order.payment_type === 'survey' && item.type === 3) {
            total =
              (invoice.vendor.margin_type === 1
                ? ((+invoice.vendor.margin_nominal / 100) *
                  Number(
                    order?.quotation[0]?.quotation_details.reduce(
                      (acc, curr) => acc + Number(curr.final_price),
                      0,
                    ),
                  ) *
                  25) /
                100
                : Number(
                  order?.quotation[0]?.quotation_details.reduce(
                    (acc, curr) => acc + Number(curr.final_price),
                    0,
                  ),
                ) + +invoice.vendor.margin_nominal) +
              Number(order.additional_fee);
          } else if (order.payment_type === 'survey' && item.type === 4) {
            total =
              (invoice.vendor.margin_type === 1
                ? ((+invoice.vendor.margin_nominal / 100) *
                  Number(
                    order?.quotation[0]?.quotation_details.reduce(
                      (acc, curr) => acc + Number(curr.final_price),
                      0,
                    ),
                  ) *
                  50) /
                100
                : Number(
                  order?.quotation[0]?.quotation_details.reduce(
                    (acc, curr) => acc + Number(curr.final_price),
                    0,
                  ),
                ) + +invoice.vendor.margin_nominal) +
              Number(order.additional_fee);
          } else if (order.payment_type === 'survey' && item.type === 5) {
            total =
              (invoice.vendor.margin_type === 1
                ? ((+invoice.vendor.margin_nominal / 100) *
                  Number(
                    order?.quotation[0]?.quotation_details.reduce(
                      (acc, curr) => acc + Number(curr.final_price),
                      0,
                    ),
                  ) *
                  25) /
                100
                : Number(
                  order?.quotation[0]?.quotation_details.reduce(
                    (acc, curr) => acc + Number(curr.final_price),
                    0,
                  ),
                ) + +invoice.vendor.margin_nominal) +
              Number(order.additional_fee);
          } else if (order.payment_type === 'pemasangan_tanpa_survey') {
            total =
              (invoice.vendor.margin_type === 1
                ? order.m_order_details
                  .filter((i) => i.item.type === 2)
                  .reduce((acc, curr) => {
                    const nominal = Number(curr?.item?.invoice_nominal || 0);
                    const quantity = Number(curr?.quantity || 0);
                    return acc + (nominal * quantity);
                  }, 0)
                : +invoice.vendor.margin_nominal *
                order.m_order_details
                  .filter((i) => i.item.type === 2)
                  .reduce(
                    (acc, curr) => acc + Number(curr?.quantity || 0),
                    0,
                  )) + Number(order.additional_fee);
          } else if (order.payment_type === 'gratis') {
            total =
              (order.m_order_details
                .filter((i) => i.item.type === 1)
                .reduce(
                  (acc, curr) => acc + Number(curr.item.invoice_nominal),
                  0,
                ) * order.m_order_details
                  .filter((i) => i.item.type === 1)
                  .reduce(
                    (acc, curr) => acc + Number(curr?.quantity || 0),
                    0,
                  )) + Number(order.additional_fee);
          }
          totalGrandTotal += total || 0;

          // Validasi safety net: jika total > grand_total, kemungkinan invoice_nominal salah
          if (total > Number(order.grand_total)) {
            this.logger.warn(
              `⚠️ Order ${order.id}: invoice_price (${total}) > grand_total (${order.grand_total}). Kemungkinan invoice_nominal item salah atau tidak sesuai dengan harga vendor.`,
            );
          }
        }

        return {
          where: { id: item.id ?? 0 },
          create: {
            order: { connect: { id: item.order_id } },
            total,
            type: item.type,
            created_by: user_id,
          },
          update: {
            order_id: item.order_id,
            total,
            updated_at: new Date(),
            updated_by: user_id,
          },
        };
      }) || [];


      const pkpNominal =
        invoice.vendor.type === 1
          ? totalGrandTotal * (+invoice.vendor.pkp_nominal / 100)
          : 0;

      const pphNominal = updateInvoiceDto.pph_nominal
        ? totalGrandTotal * (+updateInvoiceDto.pph_nominal / 100)
        : +invoice.pph_nominal;
      const ppnNominal = updateInvoiceDto.ppn_nominal
        ? totalGrandTotal * (+updateInvoiceDto.ppn_nominal / 100)
        : +invoice.ppn_nominal;

      const totalAmount =
        totalGrandTotal -
        pkpNominal -
        pphNominal +
        ppnNominal -
        (updateInvoiceDto.status === InvoiceStatus.INVOICE_DISETUJUI
          ? Number(penaltyNominal)
          : Number(invoice.penalty_nominal));

      const statusInvoice =
        totalAmount >= 5000000 && invoice.status === InvoiceStatus.PENGECEKAN_INVOICE && updateInvoiceDto.status !== InvoiceStatus.INVOICE_DITOLAK
          ? InvoiceStatus.MENUNGGU_DOKUMEN_TAGIHAN
          : updateInvoiceDto.status;
      const invoiceData = {
        total_amount: totalAmount != 0 ? totalAmount : undefined,
        ...(updateInvoiceDto.status === 5
          ? {
            invoice_to_finance_date: new Date(),
          }
          : undefined),
        status: statusInvoice,
        description: updateInvoiceDto?.description ?? undefined,
        notes: updateInvoiceDto?.notes ?? undefined,
        invoice_evidence: { createMany: { data: evidences } },
        invoice_details: { upsert: invoiceDetails },
        pph_nominal: pphNominal,
        ppn_nominal: ppnNominal,
        penalty_nominal: penaltyNominal,
        updated_at: new Date(),
        updated_by: user_id,
      };

      const detailsIds = updateInvoiceDto.invoice_details
        ? updateInvoiceDto.invoice_details
          .filter((x) => Boolean(x?.id))
          .map((item) => item?.id)
        : undefined;

      const updatedInvoice = await this.dbService.$transaction([
        this.dbService.invoices.update({
          where: { id: invoice.id },
          data: invoiceData,
        }),
        ...(invoice_evidences
          ? [
            this.dbService.invoice_evidence.updateMany({
              where: {
                invoice_id: invoice.id,
              },
              data: {
                deleted_at: new Date(),
                deleted_by: user_id,
              },
            }),
          ]
          : []),
        ...(updateInvoiceDto.invoice_details
          ? [
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
          ]
          : []),
        ...(updateInvoiceDto.status === InvoiceStatus.INVOICE_DISETUJUI
          ? [
            this.dbService.refund.updateMany({
              where: {
                paid_status: 0,
              },
              data: {
                paid_status: 1,
              },
            }),
          ]
          : []),
        ...(updateInvoiceDto.status === InvoiceStatus.INVOICE_DITOLAK
          ? [
            this.dbService.refund.updateMany({
              where: {
                orders: {
                  vendor_id: invoice.vendor.id,
                  id: {
                    in: invoice.invoice_details.map((x) => x.order_id),
                  },
                },

                paid_status: 1,
              },
              data: {
                paid_status: 0,
              },
            }),
          ] : [])
      ]);

      if (updatedInvoice) {
        await this.notifService.create(
          { invoices: updatedInvoice[0] },
          'UPDATE',
          updatedInvoice[0].created_by,
          moduleTypeNotification.INVOICE,
          updatedInvoice[0].id,
          updatedInvoice[0].status,
        );
      }

      await this.invoiceLogs(invoice.id, updatedInvoice);
      return updatedInvoice[0];
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

      // Melakukan pembaruan status invoices
      await this.dbService.$transaction([
        this.dbService.invoices.updateMany(request),
      ]);

      // Mengambil data invoices terbaru setelah pembaruan
      const updatedInvoices = await this.dbService.invoices.findMany({
        where: {
          id: {
            in: dto.invoice_id,
          },
        },
      });

      // Memeriksa dan mengubah status tambahan jika perlu
      const updatePromises = updatedInvoices.map(async (invoice) => {
        if (Number(invoice.total_amount) >= 5000000 && invoice.status === 2) {
          await this.dbService.invoices.update({
            where: { id: invoice.id },
            data: { status: 4 },
          });
        }
      });

      await Promise.all(updatePromises);

      return { count: updatedInvoices.length };
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



  private async updateInvoiceWithNotes(invoiceId: number, note: string) {
    try {
      await this.dbService.invoices.update({
        where: { id: invoiceId },
        data: {
          description: note,
          status: InvoiceStatus.INVOICE_SUDAH_DIBAYARKAN,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error updating invoice with ID ${invoiceId} with note: ${note}`,
        error,
      );
      throw error;
    }
  }


  // Delegations to InvoicesQueryService
  async findAll(query: QueryParamsDto) {
    return this.queryService.findAll(query);
  }

  async findOne(id: number) {
    return this.queryService.findOne(id);
  }

  async nextCode() {
    return this.queryService.nextCode();
  }

  async getOrderInvoice(queryParams: QueryParamsDto) {
    return this.queryService.getOrderInvoice(queryParams);
  }

  // Delegations to InvoicesExportExcelService
  async invoiceExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.exportExcelService.invoiceExportExcel(res, queryParams);
  }

  async invoiceDetailsExportExcel(id: number, res: Response) {
    return this.exportExcelService.invoiceDetailsExportExcel(id, res);
  }

  async templateInvoiceExcel(res: Response) {
    return this.exportExcelService.templateInvoiceExcel(res);
  }

  // Delegations to InvoicesRekonselPdfService
  async rekonselInvoices(id: number, res: Response) {
    return this.rekonselPdfService.rekonselInvoices(id, res);
  }

  async invoicePdf(id: number, res: Response) {
    return this.rekonselPdfService.invoicePdf(id, res);
  }

  async rekonselPdf(id: number, res: Response) {
    return this.rekonselPdfService.rekonselPdf(id, res);
  }
}
