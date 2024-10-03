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
import { curry, difference } from 'lodash';
import { objectEnumValues } from '@prisma/client/runtime/library';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceStatus } from './dto/invoice-status.enum';
import { MarginType } from 'src/quotation/dto/margin-type.enum';
import { create } from 'html-pdf';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { PAYMENT_TYPE } from 'src/order/enum/payment_type.enum';
import { PdfService } from 'src/common/service/pdf.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly dbService: PrismaService, private notifService: NotificationsService, private pdfService: PdfService,
  ) { }
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
      // console.log('Provided Order IDs: ', providedOrder);

      if (providedOrder.length === 0) {
        this.logger.error('No Order Id Provided');
        throw new Error('No Order Id Provided');
      }

      const orders = await this.dbService.orders.findMany({
        where: {
          id: {
            in: providedOrder,
          },
          // invoice_details: {
          //   none: {},
          // },
          // work_orders: {
          //   status: {
          //     category: {
          //       in: ['SURVEYDONE' ,'WORKEND', 'DONE'],
          //     },
          //   },
          // },
        },
        include: {
          m_order_details: {
            where: {
              deleted_at: null
            },
            include: {
              item: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null
            },
            include: {
              quotation_details: {
                where: {
                  deleted_at: null
                },
              },
            },
          },
          work_orders: true,
          invoice_details: {
            select: {
              id: true,
            },
          },
        },
      });

      // console.log('Orders: ', orders);

      const refund = await this.dbService.refund.findMany({
        where: {
          orders: {
            vendor_id: vendor.id,
          },
          paid_status: 0,
          approval_number: {
            not: null
          }
        },
      });

      // console.log('Refund: ', refund);

      const penaltyNominal = refund?.reduce((acc, curr) => acc + Number(curr?.penalty_nominal), 0);

      // console.log('Penalty Nominal: ', penaltyNominal);



      let totalGrandTotal = 0;
      let invoiceDetails = [];

      const formatDateToMonthYear = (dateString) => {
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}${year}`;
      };
      orders.forEach((order) => {
        createInvoiceDto.invoice_details?.forEach((detail) => {
          if (detail.order_id === order.id) {
            if (order.payment_type === 'survey' && detail.type === 1) {
              const totalMargin = vendor.nominal_survey ? Number(vendor.nominal_survey) : 75000 + Number(order.additional_fee);
              // console.log("TOTAL MARGIN: ", totalMargin);

              invoiceDetails.push({
                order_id: order.id,
                total: totalMargin,
                invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                type: detail.type,
              });
              totalGrandTotal += totalMargin || 0;
            } else if (order.payment_type === 'survey' && detail.type === 2) {
              const totalMargin = (vendor.margin_type === 1 ? (((+vendor.margin_nominal) / 100) * Number(order?.quotation[0]?.quotation_details.reduce((acc, curr) => acc + Number(curr.final_price), 0))) : ((Number(order?.quotation[0]?.quotation_details.reduce((acc, curr) => acc + Number(curr.final_price), 0)) - (+vendor.margin_nominal)))) + Number(order.additional_fee);
              invoiceDetails.push({
                order_id: order.id,
                total: totalMargin,
                invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                type: detail.type,
              });

              totalGrandTotal += totalMargin || 0;
            } else if (order.payment_type === 'pemasangan_tanpa_survey') {
              console.log(order.m_order_details
                .filter((i) => i.item.type === 2)
                .reduce((acc, curr) => acc + Number(curr?.item?.invoice_nominal || 0), 0));
              const totalMargin =
              (vendor.margin_type === 1 ? order.m_order_details
                .filter((i) => i.item.type === 2)
                .reduce((acc, curr) => acc + Number(curr?.item?.invoice_nominal || 0), 0) * ((+vendor.margin_nominal) / 100) : (+vendor.margin_nominal * order.m_order_details
                    .filter((i) => i.item.type === 2)
                    .reduce((acc, curr) => acc + Number(curr?.quantity || 0), 0))) + Number(order.additional_fee);
              invoiceDetails.push({
                order_id: order.id,
                total: totalMargin,
                invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                type: detail.type,
              });
              totalGrandTotal += totalMargin || 0;
            } else if (order.payment_type === 'gratis') {
              const totalMargin = order.m_order_details
                .filter((i) => i.item.type === 1)
                .reduce((acc, curr) => acc + Number(curr.item.invoice_nominal), 0) + Number(order.additional_fee);
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

      console.log('Invoice Details: ', invoiceDetails);

      const pkpNominal = vendor.type === 1
        ? (totalGrandTotal * (+vendor.pkp_nominal / 100))
        : 0;
      const pphNominal = createInvoiceDto.pph_nominal ? totalGrandTotal * (+createInvoiceDto.pph_nominal / 100) : 0;
      const ppnNominal = createInvoiceDto.ppn_nominal ? totalGrandTotal * (+createInvoiceDto.ppn_nominal / 100) : 0;


      const totalAmount = totalGrandTotal - (pkpNominal) - (pphNominal) - (ppnNominal) - (penaltyNominal != 0 ? penaltyNominal : 0);
      console.log('TOTAL AMOUNT: ', totalAmount);

      const invoicesCount = (await this.dbService.invoices.count()) + 1;

      console.log('Invoices Count: ', invoicesCount);

      const data = {
        vendor: {
          connect: {
            id: vendor.id,
          },
        },
        pkp_nominal: pkpNominal,
        pph_nominal: pphNominal,
        ppn_nominal: ppnNominal,
        penalty_nominal: penaltyNominal,
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

      console.log('Data: ', data);

      const [invoices] = await this.dbService.$transaction([
        this.dbService.invoices.create({ data }),
        this.dbService.refund.updateMany({
          where: {
            orders: {
              vendor_id: vendor.id,
            },
            paid_status: 0
          },
          data: {
            paid_status: 1
          }
        })
      ]);
      if (invoices) {
        await this.notifService.create({ invoices: data }, "CREATE", invoices.created_by, moduleTypeNotification.INVOICE, invoices.id, invoices.status);
      }

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
                  m_order_details: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      item: true,
                    },
                  },
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
                  m_order_details: {
                    where: {
                      deleted_at: null,
                    },
                    include: {
                      item: true,
                    },
                  },
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
        ) || undefined;

      const orders = await this.dbService.orders.findMany({
        where: { id: { in: providedOrderIds } },
        include: {
          m_order_details: {
            include: {
              item: true,
            },
          },
          quotation: {
            include: {
              quotation_details: true,
            },
          },
          work_orders: true,
        },
      });

      const refund = await this.dbService.refund.findMany({
        where: {
          orders: {
            vendor_id: invoice.vendor.id,
          },
          paid_status: 0,
          approval_number: {
            not: null
          }
        },
      });

      const penaltyNominal = refund?.reduce((acc, curr) => acc + Number(curr?.penalty_nominal), 0);

      let totalGrandTotal = invoice.invoice_details.reduce((acc, curr) => {
        return acc + Number(curr.total);
      }, 0);

      const invoiceDetails = updateInvoiceDto?.invoice_details ? updateInvoiceDto?.invoice_details.map((item) => {
        const order = orders.find((order) => order.id === item.order_id);
        let total = 0;

        if (order) {
          if (order.payment_type === 'survey' && item.type === 1) {
            total = invoice.vendor.nominal_survey ? Number(invoice.vendor.nominal_survey) : 75000 + Number(order.additional_fee);
          } else if (order.payment_type === 'survey' && item.type === 2) {
            total = (invoice.vendor.margin_type === 1 ? (((+invoice.vendor.margin_nominal) / 100) * Number(order?.quotation[0]?.quotation_details.reduce((acc, curr) => acc + Number(curr.final_price), 0))) : ((Number(order?.quotation[0]?.quotation_details.reduce((acc, curr) => acc + Number(curr.final_price), 0)) - (+invoice.vendor.margin_nominal)))) + Number(order.additional_fee);
          } else if (order.payment_type === 'pemasangan_tanpa_survey') {
            total =
            (invoice.vendor.margin_type === 1 ? order.m_order_details
              .filter((i) => i.item.type === 2)
              .reduce((acc, curr) => acc + Number(curr?.item?.invoice_nominal || 0), 0) * ((+invoice.vendor.margin_nominal) / 100) : ( order.m_order_details
                  .filter((i) => i.item.type === 2)
                  .reduce((acc, curr) => acc + Number(curr?.quantity || 0), 0) * +invoice.vendor.margin_nominal)) + Number(order.additional_fee);
          } else if (order.payment_type === 'gratis') {
            total = order.m_order_details
              .filter((i) => i.item.type === 1)
              .reduce((acc, curr) => acc + Number(curr.item.invoice_nominal), 0) + Number(order.additional_fee);
          }
          totalGrandTotal += total || 0;
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
      }) : undefined;

      const pkpNominal = invoice.vendor.type === 1
        ? (totalGrandTotal * (+invoice.vendor.pkp_nominal / 100))
        : 0;

      const pphNominal = updateInvoiceDto.pph_nominal ? totalGrandTotal * (+updateInvoiceDto.pph_nominal / 100) : +invoice.pph_nominal;
      const ppnNominal = updateInvoiceDto.ppn_nominal ? totalGrandTotal * (+updateInvoiceDto.ppn_nominal / 100) : +invoice.ppn_nominal;


      const totalAmount = totalGrandTotal - (pkpNominal) - (pphNominal) - (ppnNominal) - (penaltyNominal != 0 ? penaltyNominal : Number(invoice.penalty_nominal));

      const statusInvoice = totalAmount >= 5000000 && invoice.status === 1 ? 4 : updateInvoiceDto.status;
      const invoiceData = {
        total_amount: totalAmount != 0 ? totalAmount : undefined,
        ...(updateInvoiceDto.status === 5 ? {
          invoice_to_finance_date: new Date()
        } : undefined),
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

      const updatedInvoice =
        await this.dbService.$transaction([
          this.dbService.invoices.update({
            where: { id: invoice.id },
            data: invoiceData,
          }),
          ...(invoice_evidences ? [this.dbService.invoice_evidence.updateMany({
            where: {
              invoice_id: invoice.id,
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          })] : []),
          ...(updateInvoiceDto.invoice_details ? [
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
          ] : []),

        ]);

      if (updatedInvoice) {
        await this.notifService.create({ invoices: updatedInvoice[0] }, "UPDATE", updatedInvoice[0].created_by, moduleTypeNotification.INVOICE, updatedInvoice[0].id, updatedInvoice[0].status);
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

  async invoiceExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { invoice_status, invoice_id } = queryParams;
      const data = await this.dbService.orders.findMany({
        where: {
          deleted_at: null,
          deleted_by: null,
          invoice_details: {
            ...(invoice_status
              ? {
                some: {
                  invoices: {
                    status: invoice_status,
                  },
                },
              }
              : {}),
            ...(invoice_id
              ? {
                some: {
                  invoices: {
                    id: invoice_id,
                  },
                },
              }
              : {}),
          },
        },
        include: {
          members: true,
          vendor: true,
          store: true,
          invoice_details: {
            where: {
              AND: [
                ...(invoice_id
                  ? [
                    {
                      invoice_id: invoice_id,
                    },
                  ]
                  : []),
                {
                  deleted_at: null,
                },
              ],
            },
            include: {
              invoices: true,
              order: {
                include: {
                  members: true,
                  vendor: true,
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
        { header: 'Order Id', key: 'order_id', width: 25 },
        { header: 'Nama Customer', key: 'member_name', width: 50 },
        { header: 'Jenis Pengerjaan', key: 'payment_type', width: 50 },
        { header: 'Nomor Receipt', key: 'receipt_number', width: 60 },
        { header: 'Vendor ID', key: 'vendor_id', width: 50 },
        { header: 'Nama Vendor', key: 'vendor_name', width: 50 },
        { header: 'Nomor Invoice', key: 'invoice_number', width: 50 },
        { header: 'Total Invoice', key: 'total_amount', width: 50 },
        { header: 'Invoice Dibuat', key: 'created_at', width: 30 },
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

      data.forEach((order) => {
        order.invoice_details.forEach((detail) => {
          const invoice = detail.invoices;
          const member = order.members ? order.members.full_name : 'N/a';
          const paymentType = (() => {
            switch (order.payment_type) {
              case 'pemasangan_tanpa_survey':
                return 'Pemasangan Tanpa Survey';
              case 'survey':
                return 'Survey';
              case 'gratis':
                return 'Gratis';
              default:
                return 'N/a';
            }
          })();
          const formattedDateTime = (dateTime) =>
            `${new Date(dateTime).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
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
            invoice_id: invoice.id,
            order_id: order.id,
            member_name: member,
            payment_type: paymentType,
            receipt_number: order.receipt_number || 'N/a',
            vendor_id: order.vendor ? order.vendor_id : 'N/a',
            vendor_name: order.vendor ? order.vendor.company_name : 'N/a',
            invoice_number: invoice.invoice_number,
            total_amount: formattedGrandTotal,
            created_at: formattedDateTime(invoice.created_at),
            description: invoice.description || 'N/a',
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

      worksheet.getCell('A2').value = `DATA REKONSEL ${data[0].invoices.vendor.company_name}`;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

      // Cek nilai setelah diatur
      console.log("Setelah pengaturan, nilai A1: ", worksheet.getCell('A2').value);

      // Definisikan kolom
      worksheet.columns = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Order Id', key: 'order_id', width: 10 },
        { header: 'Nama Customer', key: 'member_name', width: 30 },
        { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
        { header: 'Tanggal \n Survey/Pengerjaan', key: 'survey_date', width: 20 },
        { header: 'Total Harga', key: 'invoice_price', width: 15 },
        { header: 'Transaksi \n Customer', key: 'customer_transaction', width: 20 },
        { header: 'Selisih PPN', key: 'ppn_difference', width: 15 },
        { header: 'Margin PPN', key: 'margin_ppn', width: 15 },
        { header: 'Selisih', key: 'difference', width: 15 },
        { header: 'Selisih \n Non PPN', key: 'margin_non_ppn', width: 15 },
        { header: 'Margin', key: 'margin', width: 15 },
        { header: 'No Receipt', key: 'receipt_number', width: 20 },
        { header: 'Status \n Order', key: 'order_status', width: 30 },
      ];

      const headerRow = worksheet.addRow(worksheet.columns.map(col => col.header));
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

      let totals = {
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
        const customer_transaction = order.order.payment_type !== PAYMENT_TYPE.SURVEY
          ? order.order.grand_total
          : (order.type === 2 && order.order.payment_type === PAYMENT_TYPE.SURVEY && order.order.quotation[0])
            ? order.order.quotation[0].quotation_grand_total
            : order.order.grand_total;

        const invoice_price = order.total;
        console.log("Invoice Price:", invoice_price);
        

        const instalation_price = Math.floor(+customer_transaction / 1.11);
        console.log("Installation Price:", instalation_price);

        const margin_ppn = instalation_price - invoice_price;
        console.log("Margin PPN:", margin_ppn);

        const price_difference = +customer_transaction - invoice_price;
        console.log("Price Difference:", price_difference);

        const receipt_number = order.order.quotation.length > 0 ? order.order.quotation[0].receipt_quotation : order.order.receipt_number;
        console.log("Receipt Number:", receipt_number);


        const row = worksheet.addRow({
          no: index + 1,
          order_id: order.order_id,
          member_name: order.order.members.full_name,
          item_name: order.order.m_order_details.map((x) => x.item_name || '-').join(', '),
          survey_date: order.order.request_work ? order.order.request_work : order.order.request_survey || '-',
          invoice_price: invoice_price,
          customer_transaction: +customer_transaction,
          instalation_price: instalation_price,
          ppn_difference: margin_ppn,
          margin_ppn: `${isNaN(margin_ppn / instalation_price) ? 0 : Math.ceil((margin_ppn / instalation_price) * 100)}%`,
          difference: price_difference,
          margin_non_ppn: Math.ceil(price_difference / 1.11),
          margin: `${isNaN(Math.ceil(((Math.ceil(price_difference / 1.11)) / +customer_transaction) * 100)) ? 0 : Math.ceil(((Math.ceil(price_difference / 1.11)) / +customer_transaction) * 100)}%`,
          receipt_number: receipt_number,
          order_status: order.order.status.description,
        });
      
        row.eachCell((cell, colNumber) => {
          // Menambahkan border ke semua sel
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
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
        totals.margin_non_ppn += Math.ceil(price_difference / 1.11);
        totals.margin += isNaN(Math.ceil(((Math.ceil(price_difference / 1.11)) / +customer_transaction) * 100)) ? 0 : Math.ceil(((Math.ceil(price_difference / 1.11)) / +customer_transaction) * 100);
        totals.ppn += isNaN(margin_ppn / instalation_price) ? 0 : Math.ceil((margin_ppn / instalation_price) * 100);        
        totals.price_difference += price_difference;
        
      });

      const totalsRow = worksheet.addRow({
        no: 'Total',
        invoice_price: totals.invoice_price,
        customer_transaction: totals.customer_transaction,
        instalation_price: totals.instalation_price,
        ppn_difference: totals.margin_ppn,
        margin_ppn: `${totals.ppn}%`,
        difference: totals.price_difference,
        margin_non_ppn: totals.margin_non_ppn,
        margin: `${totals.margin}%`,
      });

      worksheet.mergeCells(`A${totalsRow.number}:E${totalsRow.number}`);
      totalsRow.getCell('A').alignment = { vertical: 'middle', horizontal: 'center' };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
        
        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      // Fungsi untuk mendapatkan tanggal format saat ini
      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${path.basename(excelFilePath)}`);
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
      res.status(500).send("An error occurred while generating the invoice.");
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
                quotation: true
              }
            }
          }
        },
        vendor: true
      }
    });


    if (!invoices) {
      console.error('Quotation not found!');
      throw new NotFoundException('quotation not found!');
    }

    const data = {
      invoice: invoices,
    };

    const buffer = await this.pdfService.generate('invoice-pdf', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=quotation.pdf');
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
                quotation: true
              }
            }
          }
        },
        vendor: true
      }
    });
    console.log("INVOICE: ", invoices);


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

  private async updateInvoiceWithNotes(invoiceId: number, note: string) {
    try {
      await this.dbService.invoices.update({
        where: { id: invoiceId },
        data: { description: note, status: InvoiceStatus.INVOICE_SUDAH_DIBAYARKAN },
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
