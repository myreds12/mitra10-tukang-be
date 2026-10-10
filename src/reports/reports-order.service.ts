/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class ReportsOrderService {
  private readonly logger = new Logger(ReportsOrderService.name);

  constructor(private readonly dbService: PrismaService) {}

async reportOrder(query: QueryParamsDto) {
    try {
      const {
        search,
        status,
        date_from,
        date_to,
        order_by,
        sales_id,
        payment_type,
        store_id,
        vendor_id,
        member_id,
        tukang_id,
      } = query;

      const statusCategories = {
        totalPicklist: ['PICKLIST'],
        totalNewOrder: ['BOOKED', 'BOOK'],
        totalWaitingSurvey: ['SURVEYREQ', 'TUKANGSURVEY'],
        totalSurveyStart: ['SURVEYSTART'],
        totalSurveyDone: ['SURVEYDONE'],
        orderSurvey: ['SURVEYREQ', 'SURVEYSTART', 'SURVEYDONE', 'TUKANGSURVEY'],
        totalUnpaidReceipt: ['UNPAIDRECEIPT'],
        totalUnpaidQuotation: ['UNPAIDQUOTATION'],
        totalWaitingQuotationVendor: ['QUOTEIN', 'QUOTATIONDRAFT'],
        totalWaitingQuotationCustomer: [
          'QUOTEOUT',
          'QUOTATIONPAID',
          'QUOTATIONPAIDSTEPONE',
          'QUOTATIONPAIDSTEPTWO',
          'QUOTATIONPAIDSTEPTHREE',
        ],
        totalWaitingQuotation: ['QUOTEIN', 'QUOTEOUT'],
        totalWaitingWork: [
          'WORKREQ',
          'TUKANGWORK',
          'WORKREQSTEPTWO',
          'WORKREQSTEPONE',
          'WORKREQSTEPTHREE',
          'TUKANGWORKSTEPONE',
          'TUKANGWORKSTEPTWO',
          'TUKANGWORKSTEPTHREE',
        ],
        totalWorkStart: [
          'WORKSTART',
          'WORKSTARTSTEPONE',
          'WORKSTARTSTEPTWO',
          'WORKSTARTSTEPTHRE',
        ],
        orderWork: [
          'WORKREQ',
          'WORKSTART',
          'TUKANGWORK',
          'WORKREQSTEPTWO',
          'WORKREQSTEPTHREE',
          'WORKREQSTEPONE',
          'WORKSTARTSTEPONE',
          'WORKSTARTSTEPTWO',
          'WORKSTARTSTEPTHREE',
          'TUKANGWORKSTEPONE',
          'TUKANGWORKSTEPTWO',
          'TUKANGWORKSTEPTHREE',
        ],
        totalOrderComplaint: ['WARRANTYCLAIM'],
        totalRework: [
          'REWORKREQ',
          'REWORKSTART',
          'REWORKEND',
          'RETUKANGSURVEY',
        ],
        totalReworkDone: ['REWORKEND'],
        totalResurvey: [
          'RESURVEYREQ',
          'RESURVEYSTART',
          'RESURVEYDONE',
          'RETUKANGSURVEY',
        ],
        totalResurveyDone: ['RESURVEYDONE'],
        totalOrderDone: [
          'WORKEND',
          'WORKENDSTEPONE',
          'WORKENDSTEPTWO',
          'WORKENDSTEPTHREE',
          'INVOICEDRAFT',
          'INVOICE',
          'INVOICESEND',
          'WARRANTYCLAIM',
          'QUOTATIONPAID',
          'DONE',
        ],
        totalCancel: ['CANCEL'],
        totalCancelRefund: [
          'CANCELREFUND',
          'REFUNDAPPROVEDBYHO',
          'REFUNDREJECTEDBYHO',
        ],
        totalProgressOrder: [
          'BOOKED',
          'BOOK',
          'PICKLIST',
          'SURVEYREQ',
          'SURVEYSTART',
          'SURVEYEND',
          'SURVEYDONE',
          'UNPAIDRECEIPT',
          'WORKREQ',
          'WORKSTART',
          'TUKANGSURVEY',
          'TUKANGWORK',
          // 'WORKEND',
          'QUOTEIN',
          'QUOTEOUT',
          'UNPAID',
          'PAID',
          'INVESTIGATED',
          'RESURVEYREQ',
          'RESURVEYSTART',
          'RESURVEYEND',
          'REWORKREQ',
          'REWORKSTART',
          'REWORKEND',
        ],
        totalResurveyComplaintDone: ['RESURVEYDONE'],
        totalReworkComplaint: [
          'REWORKREQ',
          'REWORKSTART',
          'REWORKEND',
          'RETUKANGSURVEY',
        ],
        totalReworkComplaintDone: ['REWORKEND'],
        totalResurveyComplaint: [
          'RESURVEYREQ',
          'RESURVEYSTART',
          'RESURVEYDONE',
          'RETUKANGSURVEY',
        ],
        totalComplaintApprovedByHo: ['COMPLAINTAPPROVEDBYHO'],
        totalComplaintRejectedByHo: ['COMPLAINTREJECTEDBYHO'],
        totalComplaint: ['INVESTIGATED'],
        totalReschedule: ['RESCHEDULE'],
        totalRefund: [
          'REFUND',
          'CANCELREFUND',
          'REFUNDAPPROVEDBYHO',
          'REFUNDREJECTEDBYHO',
        ],
        totalWaitingResolve: ['INVESTIGATED'],
        totalActiveWarranty: ['ACTIVEWARRANTY'],
        totalUsedWarranty: ['USEDWARRANTY'],
        totalExpiredWarranty: ['EXPIREDWARRANTY'],
      };

      // Determine if it's the same day report, same month report, or monthly report
      const isSameDay = date_from === date_to;
      const isSameMonth =
        new Date(date_from).getMonth() === new Date(date_to).getMonth() &&
        new Date(date_from).getFullYear() === new Date(date_to).getFullYear();
      const allHours = Array.from({ length: 24 }, (_, i) =>
        i.toString().padStart(2, '0'),
      );
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
      const allDaysInMonth = Array.from(
        {
          length: new Date(
            new Date(date_from).getFullYear(),
            new Date(date_from).getMonth() + 1,
            0,
          ).getDate(),
        },
        (_, i) => (i + 1).toString().padStart(2, '0'),
      );
      const periods = isSameDay
        ? allHours
        : isSameMonth
        ? allDaysInMonth
        : allMonths;

      // Initialize summary template and summary object
      const summaryTemplate = {
        totalOrder: 0,
        totalOrderGrandTotal: 0,
        totalPicklist: 0,
        totalNewOrder: 0,
        totalWaitingSurvey: 0,
        totalSurveyStart: 0,
        totalSurveyDone: 0,
        orderSurvey: 0,
        totalUnpaidReceipt: 0,
        totalUnpaidQuotation: 0,
        totalWaitingQuotation: 0,
        totalWaitingQuotationVendor: 0,
        totalWaitingQuotationCustomer: 0,
        totalWaitingWork: 0,
        totalWorkStart: 0,
        orderWork: 0,
        totalOrderComplaint: 0,
        totalRework: 0,
        totalResurvey: 0,
        totalOrderDone: 0,
        totalCancel: 0,
        totalCancelRefund: 0,
        totalProgressOrder: 0,
        totalResurveyComplaint: 0,
        totalResurveyComplaintDone: 0,
        totalReworkComplaint: 0,
        totalReworkComplaintDone: 0,
        totalComplaintApprovedByHo: 0,
        totalComplaintRejectedByHo: 0,
        totalComplaint: 0,
        totalReschedule: 0,
        totalRefund: 0,
        totalWaitingResolve: 0,
        totalActiveWarranty: 0,
        totalExpiredWarranty: 0,
      };

      const summary = periods.reduce((acc, period) => {
        acc[period] = { ...summaryTemplate };
        return acc;
      }, {});

      // Build where clause for Prisma query
      const where = {
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
          ...(search
            ? [
                {
                  OR: [
                    { receipt_number: { contains: search } },
                    { request_survey: { equals: new Date(search) } },
                    { members: { full_name: { contains: search } } },
                  ],
                },
              ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(member_id ? [{ member_id: { equals: member_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          ...(store_id ? [{ store_id: { in: store_id } }] : []),
          ...(vendor_id
            ? [
                {
                  vendor: {
                    id: {
                      equals: vendor_id,
                    },
                    deleted_at: null,
                  },
                },
              ]
            : []),
          ...(tukang_id
            ? [
                {
                  work_orders: {
                    work_order_tukang: {
                      some: {
                        tukang_id: tukang_id,
                      },
                    },
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const orders = await this.dbService.orders.findMany({
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          quotation: true,
          work_orders: {
            include: {
              status: true,
              work_order_status: {
                include: {
                  status: true,
                },
              },
            },
          },
          complaints: {
            include: {
              status: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
            },
          },
        },
      });

      // Fetch complaints, reschedules, and refunds data

      // Process data into summary
      const H_PLUS_7_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = new Date();

      orders.forEach((order) => {
        // Tambahkan 7 jam ke waktu UTC
        const orderTimeInWIB = new Date(
          new Date(order.created_at).getTime() + 7 * 60 * 60 * 1000,
        );

        const period = isSameDay
          ? orderTimeInWIB.toLocaleString('id-ID', {
              hour: '2-digit',
              hour12: false,
            })
          : isSameMonth
          ? orderTimeInWIB.toLocaleString('id-ID', {
              day: '2-digit',
            })
          : orderTimeInWIB.toLocaleString('id-ID', {
              month: 'long',
            });

        if (summary[period]) {
          if (!['INVESTIGATED'].includes(order.status.category)) {
            summary[period].totalOrder++;
          }
          summary[period].totalOrderGrandTotal += Number(order.grand_total);

          Object.entries(statusCategories).forEach(([key, statuses]) => {
            if (statuses.includes(order.status.category)) {
              summary[period][key]++;
            }
          });

          if (order.receipt_number === null) {
            summary[period].totalUnpaidReceipt++;
          }

          if (order?.work_orders?.status?.category === 'RESURVEY') {
            summary[period].totalResurveyComplaint++;
          }
          if (order?.work_orders?.status?.category === 'RESURVEYDONE') {
            summary[period].totalResurveyComplaintDone++;
          }
          if (order?.work_orders?.status?.category === 'REWORK') {
            summary[period].totalReworkComplaintDone++;
          }
          if (order?.work_orders?.status?.category === 'REWORKEND') {
            summary[period].totalReworkComplaint++;
          }

          if (
            order?.complaints[0]?.status?.category === 'COMPLAINTAPPROVEDBYHO'
          ) {
            summary[period].totalComplaintApprovedByHo++;
          }

          if (
            order?.complaints?.find(
              (i) => i.status.category === 'COMPLAINTREJECTEDBYHO',
            )
          ) {
            summary[period].totalComplaintRejectedByHo++;
          }

          if (
            (order.payment_type === 'survey' ||
              order.payment_type === 'pemasangan_tanpa_survey') &&
            order?.quotation[0]?.receipt_quotation === null
          ) {
            summary[period].totalUnpaidQuotation++;
          }

          const workEndDate = new Date(
            order?.work_orders?.work_order_status?.find(
              (i) => i.status.category === 'WORKEND',
            )?.created_at,
          );
          const warrantyExpirationDate = new Date(
            workEndDate.getTime() + H_PLUS_7_DAYS,
          );

          const orderDoneStatuses = statusCategories.totalOrderDone;

          if (orderDoneStatuses.includes(order.status.category)) {
            if (order.complaints) {
              summary[period].totalUsedWarranty++;
            }

            if (now <= warrantyExpirationDate) {
              summary[period].totalActiveWarranty++;
            } else {
              summary[period].totalExpiredWarranty++;
            }
          }
        }
      });

      // Ensure all periods are accounted for, even if empty
      periods.forEach((period) => {
        if (!summary[period]) {
          summary[period] = { ...summaryTemplate };
        }
      });

      // Prepare report data
      const reportData = periods.map((period) => ({
        period,
        ...summary[period],
      }));

      // Aggregate counts and totals
      const count = await this.dbService.orders.count({ where });
      const orderGrandTotal = await this.dbService.orders
        .aggregate({
          where,
          _sum: { grand_total: true },
        })
        .then((data) => data._sum.grand_total);

      const quoteInGrandTotal = await this.dbService.quotation
        .aggregate({
          where: {
            order_id: { in: orders.map((item) => item.id) },
            status: { category: { contains: 'QUOTEIN' } },
          },
          _sum: { quotation_grand_total: true },
        })
        .then((data) => data._sum.quotation_grand_total);

      return {
        data: reportData,
        meta: {
          total: count,
          orderGrandTotal,
          quoteInGrandTotal,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

async reportWorkOrder(query: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        status,
        tukang_id,
        vendor_id,
      } = query;

      const statusCategories = {
        totalWaitingSurvey: ['SURVEYREQ', 'TUKANGSURVEY'],
        totalSurveyStart: ['SURVEYSTART'],
        totalSurveyDone: ['SURVEYDONE'],
        orderSurvey: ['SURVEYREQ', 'SURVEYSTART', 'SURVEYDONE', 'TUKANGSURVEY'],
        totalPaidQuotation: ['UNPAIDQUOTATION'],
        totalWaitingWork: [
          'WORKREQ',
          'TUKANGWORK',
          'WORKREQSTEPTWO',
          'WORKREQSTEPONE',
          'WORKREQSTEPTHREE',
          'TUKANGWORKSTEPONE',
          'TUKANGWORKSTEPTWO',
          'TUKANGWORKSTEPTHREE',
        ],
        totalWorkStart: [
          'WORKSTART',
          'WORKSTARTSTEPONE',
          'WORKSTARTSTEPTWO',
          'WORKSTARTSTEPTHRE',
        ],
        orderWork: [
          'WORKREQ',
          'WORKSTART',
          'WORKREQSTEPTWO',
          'WORKREQSTEPTHREE',
          'WORKREQSTEPONE',
          'WORKSTARTSTEPONE',
          'WORKSTARTSTEPTWO',
          'WORKSTARTSTEPTHREE',
          'TUKANGWORKSTEPONE',
          'TUKANGWORKSTEPTWO',
          'TUKANGWORKSTEPTHREE',
        ],
        totalCancel: [
          'CANCEL',
          'CANCELREFUND',
          'REFUNDAPPROVEDBYHO',
          'REFUNDREJECTEDBYHO',
        ],
        totalOrderDone: ['WORKEND'],
      };

      // Determine if it's the same day report, same month report, or monthly report
      const isSameDay = date_from === date_to;
      const isSameMonth =
        new Date(date_from).getMonth() === new Date(date_to).getMonth() &&
        new Date(date_from).getFullYear() === new Date(date_to).getFullYear();
      const allHours = Array.from({ length: 24 }, (_, i) =>
        i.toString().padStart(2, '0'),
      );
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
      const allDaysInMonth = Array.from(
        {
          length: new Date(
            new Date(date_from).getFullYear(),
            new Date(date_from).getMonth() + 1,
            0,
          ).getDate(),
        },
        (_, i) => (i + 1).toString().padStart(2, '0'),
      );
      const periods = isSameDay
        ? allHours
        : isSameMonth
        ? allDaysInMonth
        : allMonths;

      // Initialize summary template and summary object
      const summaryTemplate = {
        totalOrder: 0,
        totalWaitingSurvey: 0,
        totalSurveyStart: 0,
        totalSurveyDone: 0,
        orderSurvey: 0,
        totalPaidQuotation: 0,
        totalWaitingWork: 0,
        totalWorkStart: 0,
        orderWork: 0,
        totalOrderDone: 0,
        totalCancel: 0,
      };

      const summary = periods.reduce((acc, period) => {
        acc[period] = { ...summaryTemplate };
        return acc;
      }, {});

      const skip = page * take - take;
      const where: Prisma.work_ordersWhereInput = {
        AND: [
          search
            ? {
                OR: [
                  ...(isNaN(Date.parse(search))
                    ? []
                    : [
                        { request_work_time: { equals: new Date(search) } },
                        { survey_date: { equals: new Date(search) } },
                        { work_start_date: { equals: new Date(search) } },
                        { work_end_date: { equals: new Date(search) } },
                      ]),
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    orders: {
                      members: {
                        whatsapp_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      members: {
                        phone_number: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    order: {
                      members: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    orders: {
                      sales: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                ],
              }
            : undefined,
          status ? { status: { id: { in: status } } } : undefined,
          vendor_id
            ? {
                vendor_id: vendor_id,
              }
            : undefined,
          tukang_id
            ? {
                work_order_tukang: {
                  some: {
                    tukang_id: tukang_id,
                  },
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(`${date_from}T00:00:00.000Z`),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };

      const work_orders = await this.dbService.work_orders.findMany({
        skip,
        where,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          status: true,
          order: {
            include: {
              status: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                },
                include: {
                  item: true,
                },
              },
              store: true,
              sales: true,
              members: true,
              quotation: {
                include: {
                  quotation_details: true,
                },
              },
            },
          },
          request_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang_to_request_tukang: true,
              tukang_to_replace_tukang: true,
            },
          },
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            include: {
              tukang: true,
            },
          },
          vendor: true,
          work_order_status: {
            where: {
              deleted_at: null,
            },
            include: {
              status: true,
              work_order_items: {
                include: {
                  item: true,
                  quotation_details: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          work_order_evidences: true,
        },
      });

      // Fetch complaints, reschedules, and refunds data

      // Process data into summary

      work_orders.forEach((order) => {
        const period = isSameDay
          ? new Date(order.created_at).toLocaleString('id-ID', {
              hour: '2-digit',
              hour12: false,
            })
          : isSameMonth
          ? new Date(order.created_at).toLocaleString('id-ID', {
              day: '2-digit',
            })
          : new Date(order.created_at).toLocaleString('id-ID', {
              month: 'long',
            });

        if (summary[period]) {
          summary[period].totalOrder++;

          Object.entries(statusCategories).forEach(([key, statuses]) => {
            if (statuses.includes(order.status.category)) {
              summary[period][key]++;
            }
          });

          if (
            (order.order.payment_type === 'survey' ||
              order.order.payment_type === 'pemasangan_tanpa_survey') &&
            order?.order.quotation[0]?.receipt_quotation != null
          ) {
            summary[period].totalPaidQuotation++;
          }
        }
      });

      // Update summary with complaints, reschedules, and refunds data

      // Ensure all periods are accounted for, even if empty
      periods.forEach((period) => {
        if (!summary[period]) {
          summary[period] = { ...summaryTemplate };
        }
      });

      // Prepare report data
      const reportData = periods.map((period) => ({
        period,
        ...summary[period],
      }));

      // Aggregate counts and totals
      const count = await this.dbService.work_orders.count({ where });

      const quoteInGrandTotal = await this.dbService.quotation
        .aggregate({
          where: {
            order_id: { in: work_orders.map((item) => item.order_id) },
            status: { category: { contains: 'QUOTEIN' } },
          },
          _sum: { quotation_grand_total: true },
        })
        .then((data) => data._sum.quotation_grand_total);

      return {
        data: reportData,
        meta: {
          total: count,
          quoteInGrandTotal,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
