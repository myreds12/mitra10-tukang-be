/* eslint-disable prettier/prettier */
import {
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

@Injectable()
export class InvoicesService {
  constructor(
    private readonly dbService: PrismaService,
    private notifService: NotificationsService,
    private pdfService: PdfService,
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
        ? [...new Set(
          createInvoiceDto.invoice_details.map(({ order_id }) => Number(order_id))
        )]
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
              deleted_at: null,
            },
            include: {
              item: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
            },
            include: {
              quotation_details: {
                where: {
                  deleted_at: null,
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
              if (order.payment_type === 'survey' && detail.type === 1) {
                const totalMargin =
                  (vendor.nominal_survey ? Number(vendor.nominal_survey) : 75000) +
                  Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });
                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'survey' && detail.type === 2) {
                const totalMargin =
                  vendor.margin_type === 1
                    ? (+vendor.margin_nominal / 100) *
                    Number(
                      order?.quotation[0]?.quotation_details.reduce(
                        (acc, curr) => acc + Number(curr.final_price),
                        0
                      )
                    )
                    : Number(
                      order?.quotation[0]?.quotation_details.reduce(
                        (acc, curr) => acc + Number(curr.final_price),
                        0
                      )
                    ) +
                    +vendor.margin_nominal +
                    Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });

                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'survey' && detail.type === 3) {
                const totalMargin =
                  (vendor.margin_type === 1
                    ? ((+vendor.margin_nominal / 100) *
                      Number(
                        order?.quotation[0]?.quotation_details.reduce(
                          (acc, curr) => acc + Number(curr.final_price),
                          0
                        )
                      ) *
                      25) /
                    100
                    : Number(
                      order?.quotation[0]?.quotation_details.reduce(
                        (acc, curr) => acc + Number(curr.final_price),
                        0
                      )
                    ) +
                    +vendor.margin_nominal) +
                  Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });

                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'survey' && detail.type === 4) {
                const totalMargin =
                  vendor.margin_type === 1
                    ? ((+vendor.margin_nominal / 100) *
                      Number(
                        order?.quotation[0]?.quotation_details.reduce(
                          (acc, curr) => acc + Number(curr.final_price),
                          0
                        )
                      ) *
                      50) /
                    100
                    : Number(
                      order?.quotation[0]?.quotation_details.reduce(
                        (acc, curr) => acc + Number(curr.final_price),
                        0
                      )
                    ) +
                    +vendor.margin_nominal +
                    Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });

                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'survey' && detail.type === 5) {
                const totalMargin =
                  vendor.margin_type === 1
                    ? ((+vendor.margin_nominal / 100) *
                      Number(
                        order?.quotation[0]?.quotation_details.reduce(
                          (acc, curr) => acc + Number(curr.final_price),
                          0
                        )
                      ) *
                      25) /
                    100
                    : Number(
                      order?.quotation[0]?.quotation_details.reduce(
                        (acc, curr) => acc + Number(curr.final_price),
                        0
                      )
                    ) +
                    +vendor.margin_nominal +
                    Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });

                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'pemasangan_tanpa_survey') {
                const totalMargin =
                  (vendor.margin_type === 1
                    ? order.m_order_details
                      .filter((i) => i.item.type === 2)
                      .reduce((acc, curr) => {
                        const nominal = Number(curr?.item?.invoice_nominal || 0);
                        const quantity = Number(curr?.quantity || 0);
                        return acc + nominal * quantity;
                      }, 0)
                    : +vendor.margin_nominal *
                    order.m_order_details
                      .filter((i) => i.item.type === 2)
                      .reduce(
                        (acc, curr) => acc + Number(curr?.quantity || 0),
                        0
                      )) + Number(order.additional_fee);

                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });
                totalGrandTotal += totalMargin || 0;
              } else if (order.payment_type === 'gratis') {
                const totalMargin =
                  order.m_order_details
                    .filter((i) => i.item.type === 1)
                    .reduce((acc, curr) => {
                      const nominal = Number(curr?.item?.invoice_nominal || 0);
                      const quantity = Number(curr?.quantity || 0);
                      return acc + nominal * quantity;
                    }, 0) +
                  Number(order.additional_fee);
                invoiceDetails.push({
                  order_id: order.id,
                  total: totalMargin,
                  invoice_number: `INV${formatDateToMonthYear(order.created_at)}`,
                  type: detail.type,
                });
                totalGrandTotal += totalMargin || 0;
              }
            }
          }
        });
      });

      const pkpNominal =
        vendor.type === 1 ? totalGrandTotal * (+vendor.pkp_nominal / 100) : 0;
      const pphNominal = createInvoiceDto.pph_nominal
        ? totalGrandTotal * (+createInvoiceDto.pph_nominal / 100)
        : 0;
      const ppnNominal = createInvoiceDto.ppn_nominal
        ? totalGrandTotal * (+createInvoiceDto.ppn_nominal / 100)
        : 0;

      const totalAmount =
        totalGrandTotal + pkpNominal + pphNominal + ppnNominal;

      const invoicesCount = (await this.dbService.invoices.count()) + 1;

      const data = {
        vendor: {
          connect: {
            id: vendor.id,
          },
        },
        pkp_nominal: pkpNominal,
        pph_nominal: pphNominal,
        ppn_nominal: ppnNominal,
        penalty_nominal: 0,
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
      ]);
      if (invoices) {
        await this.notifService.create(
          { invoices: invoices },
          'CREATE',
          invoices.created_by,
          moduleTypeNotification.INVOICE,
          invoices.id,
          invoices.status,
        );
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
                  quotation: {
                    where: {
                      deleted_at: null
                    },
                    include: {
                      quotation_receipt: {
                        where: {
                          deleted_at: null
                        }
                      }
                    }
                  }
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
          vendor: {
            include: { bank: true }
          },
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
                  quotation: {
                    where: {
                      deleted_at: null
                    },
                    include: {
                      quotation_receipt: {
                        where: {
                          deleted_at: null
                        }
                      }
                    }
                  },
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
          approval_number: {
            not: null,
          },
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
              : 75000) + Number(order.additional_fee);
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
                orders: {
                  vendor_id: invoice.vendor.id,
                },
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

  // async getOrderInvoice(queryParams: QueryParamsDto) {
  //   try {
  //     const {
  //       take,
  //       page,
  //       search,
  //       status,
  //       date_from,
  //       date_to,
  //       order_by,
  //       payment_type,
  //       store_id,
  //       vendor_id,
  //       work_order_status,
  //       offset
  //     } = queryParams;

  //     const skip = offset > 0 ? offset : page * take - take;
  //     const where: Prisma.ordersWhereInput = {
  //       AND: [
  //         ...(search
  //           ? [
  //             {
  //               OR: [
  //                 { receipt_number: { contains: search } },
  //                 { id: !isNaN(+search) ? +search : undefined },
  //                 { members: { full_name: { contains: search } } },
  //                 { store: { store_name: { contains: search } } },
  //                 { project_number: { contains: search } },
  //                 { vendor: { company_name: { contains: search } } },
  //                 { members: { phone_number: { contains: search } } },
  //                 { members: { whatsapp_number: { contains: search } } },
  //               ],
  //             },
  //           ]
  //           : []),
  //         ...(status ? [{ status: { id: { in: status } } }] : []),
  //         ...(work_order_status
  //           ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
  //           : []),
  //         ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
  //         ...(store_id ? [{ store_id: { in: store_id } }] : []),
  //         ...(vendor_id ? [{ vendor: { id: vendor_id, deleted_at: null } }] : []),
  //         ...(date_from && date_to
  //           ? [
  //             {
  //               created_at: {
  //                 gte: new Date(date_from),
  //                 lte: new Date(`${date_to}T23:59:59.000Z`),
  //               },
  //             },
  //           ]
  //           : []),
  //       ].filter(Boolean),
  //       order_history: {
  //         some: {
  //           status: {
  //             category: {
  //               in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
  //             },
  //           },
  //         },
  //       },
  //       deleted_at: null,
  //     };

  //     const data = await this.dbService.orders.findMany({
  //       skip,
  //       take: take > 0 ? take : undefined,
  //       where,
  //       orderBy: {
  //         created_at: order_by,
  //       },
  //       include: {
  //         store: true,
  //         quotation: true, // Mengambil quotation_grand_total
  //         order_history: {
  //           where: {
  //             status: {
  //               category: {
  //                 in: ['QUOTEIN', 'WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'],
  //               },
  //             },
  //           },
  //           include: {
  //             status: true
  //           },
  //           orderBy: { created_at: 'desc' }, // Ambil yang terbaru
  //         },
  //       },
  //     });

  //     // Mapping hasil sesuai permintaan
  //     const formattedData = data.flatMap(order => {
  //       const quoteInHistory = order.order_history.find(h => h.status.category === 'QUOTEIN');
  //       const workEndHistory = order.order_history.find(h =>
  //         ['WORKEND', 'WORKENDSTEPONE', 'WORKENDSTEPTWO', 'WORKENDSTEPTHREE'].includes(h.status.category)
  //       );

  //       const results = [];

  //       const getOrderType = (status: string): number => ({
  //         QUOTEIN: 1,
  //         WORKEND: 2,
  //         REWORKEND: 2,
  //         WORKENDSTEPONE: 3,
  //         WORKENDSTEPTWO: 4,
  //         WORKENDSTEPTHREE: 5
  //       }[status] || 0);

  //       const getGrandTotal = (orderType: number): number => {
  //         const total = Number(order.quotation[0]?.quotation_grand_total || 0);
  //         return orderType === 1 ? Number(order.grand_total)
  //           : orderType === 3 || orderType === 5 ? total / 4
  //             : orderType === 4 ? total / 2
  //               : total;
  //       };

  //       if (quoteInHistory) {
  //         const orderType = getOrderType(quoteInHistory.status.category);
  //         results.push({
  //           order_id: order.id,
  //           store_name: order.store.store_name,
  //           date_order: order.created_at,
  //           order_type: orderType,
  //           order_status: quoteInHistory.status.category,
  //           order_status_label: quoteInHistory.status.description,
  //           grand_total: getGrandTotal(orderType),
  //         });
  //       }

  //       if (workEndHistory) {
  //         const orderType = getOrderType(workEndHistory.status.category);
  //         results.push({
  //           order_id: order.id,
  //           store_name: order.store.store_name,
  //           date_order: order.created_at,
  //           order_type: orderType,
  //           order_status: workEndHistory.status.category,
  //           order_status_label: workEndHistory.status.description,
  //           grand_total: getGrandTotal(orderType),
  //         });
  //       }

  //       return results;
  //     });

  //     // ✅ Pagination mengikuti jumlah final dari `formattedData`
  //     const totalResults = formattedData.length; // Hitung total berdasarkan hasil akhir

  //     // Implementasi pagination yang sesuai dengan frontend
  //     const paginatedData = formattedData.slice(skip, skip + take);

  //     return {
  //       data: paginatedData,
  //       meta: {
  //         skip,
  //         offset,
  //         page,
  //         take,
  //         total: totalResults,
  //         takeTotal: paginatedData.length,
  //       },
  //     };


  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

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
        const calculateSurveyTotal = (quotationDetails, workStep) =>
          quotationDetails
            .filter(({ work_step }) => work_step === workStep)
            .reduce((total, { quotation_special_price }) => total + Number(quotation_special_price), 0);

        const getCustomerTransaction = (order: any) => {
          const { payment_type: paymentType, grand_total: grandTotal, quotation } = order.order;

          if (paymentType !== PAYMENT_TYPE.SURVEY) return grandTotal;
          if (!quotation?.length) return 0;

          const { quotation_grand_total: quotationGrandTotal, quotation_details: quotationDetails } = quotation[0];
          const surveyCalculators = {
            1: () => grandTotal,
            2: () => quotationGrandTotal,
            3: () => calculateSurveyTotal(quotationDetails, 1),
            4: () => calculateSurveyTotal(quotationDetails, 2),
            5: () => calculateSurveyTotal(quotationDetails, 3),
          };

          return surveyCalculators[order.type]?.();
        };

        const customer_transaction = getCustomerTransaction(order);
        const invoice_price = order.total;
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

    const buffer = await this.pdfService.generate('invoice-pdf', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice.pdf');
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
}
