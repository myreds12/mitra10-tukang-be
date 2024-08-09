import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { currentLineHeight } from 'pdfkit';

@Injectable()
export class ReportsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly httpService: HttpService,
  ) {}
  async create(createReportDto: CreateReportDto) {}
  async findAll() {}

  async salesComissionReport(query: QueryParamsDto) {
    try {
      const {
        sales_id,
        store_id,
        page,
        take,
        date_from,
        date_to,
        status,
        search,
      } = query;
      const skip = page * take - take;
      const where: Prisma.sales_incentiveWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  quotation: {
                    order_id: !isNaN(+search) ? +search : undefined,
                  },
                },
                {
                  quotation: {
                    order: {
                      members: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                },
                {
                  sales: {
                    full_name: {
                      contains: search,
                    },
                  },
                },
                {
                  nominal: !isNaN(+search) ? +search : undefined,
                },
                {
                  quotation: {
                    quotation_grand_total: !isNaN(+search)
                      ? +search
                      : undefined,
                  },
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  sales: {
                    store_id: {
                      in: store_id,
                    },
                  },
                },
              ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { in: status } }] : []),
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
        ].filter(Boolean),
        deleted_at: null,
      };

      const salesIncetive = await this.dbService.sales_incentive.findMany({
        where,
        skip,
        take: take > 0 ? take : undefined,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          sales: {
            include: {
              store: true,
            },
          },
          incentive: true,
          quotation: {
            include: {
              order: {
                include: {
                  members: true,
                  status: true,
                },
              },
            },
          },
        },
      });
      // console.log(sales);
      const totalIncentive = await this.dbService.sales_incentive.aggregate({
        where,
        _sum: {
          nominal: true,
        },
      });

      const count = await this.dbService.sales_incentive.count({
        where,
      });

      return {
        data: salesIncetive,
        meta: { totalIncentive, page, take, total: count },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

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
        orderSurvey: ['SURVEYREQ', 'SURVEYSTART', 'SURVEYDONE'],
        totalUnpaidReceipt: ['UNPAIDRECEIPT'],
        totalUnpaidQuotation: ['UNPAIDQUOTATION'],
        totalWaitingQuotationVendor: ['QUOTEIN'],
        totalWaitingQuotationCustomer: ['QUOTEOUT'],
        totalWaitingQuotation: ['QUOTEIN', 'QUOTEOUT'],
        totalWaitingWork: ['WORKREQ', 'TUKANGWORK'],
        totalWorkStart: ['WORKSTART'],
        orderWork: ['WORKREQ', 'WORKSTART', 'WORKDONE'],
        totalOrderComplaint: ['WARRANTYCLAIM'],
        totalRework: ['REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalReworkDone: ['REWORKEND'],
        totalResurvey: ['RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE'],
        totalResurveyDone: ['RESURVEYDONE'],
        totalOrderDone: [
          'WORKEND',
          'INVOICEDRAFT',
          'INVOICE',
          'INVOICESEND',
          'WARRANTYCLAIM',
          'DONE',
        ],
        totalCancel: ['CANCEL'],
        totalCancelRefund: ['CANCELREFUND'],
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
        totalResurveyComplaintDone: ['COMPLAINTRESURVEYDONE'],
        totalReworkComplaint: ['COMPLAINTREWORK'],
        totalReworkComplaintDone: ['COMPLAINTREWORKDONE'],
        totalResurveyComplaint: ['COMPLAINTRESURVEY'],
        totalComplaintApprovedByHo: ['COMPLAINTAPPROVEDBYHO'],
        totalComplaintRejectedByHo: ['COMPLAINTREJECTEDBYHO'],
        totalComplaint: ['INVESTIGATED'],
        totalReschedule: ['RESCHEDULE'],
        totalRefund: ['CANCELREFUND'],
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
      const [complaints, reschedules, refunds] = await Promise.all([
        this.dbService.complaints.findMany({
          where: {
            ...(date_from && date_to
              ? {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                }
              : undefined),
            ...(store_id
              ? {
                  orders: {
                    store_id: { in: store_id },
                  },
                }
              : undefined),
            ...(vendor_id
              ? {
                  orders: {
                    vendor_id: vendor_id,
                  },
                }
              : undefined),
            status: {
              category: {
                contains: 'INVESTIGATED'
              }
            },
            deleted_at: null,
          },
          include: {
            status: true,
          },
        }),
        this.dbService.reschedule.findMany({
          where: {
            ...(date_from && date_to
              ? {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                }
              : undefined),
            ...(store_id
              ? {
                  order: {
                    store_id: { in: store_id },
                  },
                }
              : undefined),
            ...(vendor_id
              ? {
                  order: {
                    vendor_id: vendor_id,
                  },
                }
              : undefined),
            order: {
              status: {
                category: {
                  contains: 'RESCHEDULE',
                },
              },
            },
            deleted_at: null,
          },
        }),
        this.dbService.refund.findMany({
          where: {
            ...(date_from && date_to
              ? {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                }
              : undefined),
            ...(store_id
              ? {
                  orders: {
                    store_id: { in: store_id },
                  },
                }
              : undefined),
            ...(vendor_id
              ? {
                  orders: {
                    vendor_id: vendor_id,
                  },
                }
              : undefined),
            deleted_at: null,
          },
        }),
      ]);

      // Process data into summary
      const H_PLUS_7_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = new Date();

      orders.forEach((order) => {
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
          if (
            !['CANCEL', 'CANCELREFUND'].includes(order.status.category)
          ) {
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

          if (order.status.category === 'WORKEND') {
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

      // console.log('Fetched orders:', orders);
      // console.log('Fetched complaints:', complaints);
      // console.log('Fetched reschedules:', reschedules);
      // console.log('Fetched refunds:', refunds);
      // console.log("Generated summary:", summary);
      // console.log("Generated report data:", reportData);

      // Return final report
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

  async complaintReport(queryParamsDto: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        member_id,
        vendor_id,
      } = queryParamsDto;
      const skip = page * take - take;

      const statuses = await this.dbService.status.findMany();

      const statusCancel = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('cancel'),
      );
      const statusComplaintApprovedByHo = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('complaintapprovedbyho'),
      );
      const statusComplaintApprovedByVendor = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('complaintapprovedbyvendor'),
      );
      const statusRejectByHo = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('complaintrejectedbyho'),
      );
      const statusRejectByVendor = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('complaintrejectedbyvendor'),
      );
      const statusReworkStart = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('reworkstart'),
      );
      const statusReworkReq = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('reworkreq'),
      );
      const statusReworkEnd = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('reworkend'),
      );
      const where: Prisma.complaintsWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : null,
          search
            ? { complaint_channels: { name: { contains: search } } }
            : null,
          ...(member_id
            ? [
                {
                  orders: {
                    member_id: member_id,
                  },
                },
              ]
            : []),
          ...(vendor_id
            ? [
                {
                  orders: {
                    vendor_id: {
                      equals: vendor_id,
                    },
                  },
                },
              ]
            : []),
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
      const totalCancelComplaintPerMonth = {};
      const totalApprovedByHOComplaintPerMonth = {};
      const totalApprovedByVendorComplaintPerMonth = {};
      const totalRejectByVendorComplaintPerMonth = {};
      const totalRejectByHOComplaintPerMonth = {};
      const totalReworkStartComplaintPerMonth = {};
      const totalReworkEndComplaintPerMonth = {};
      const totalReworkReqComplaintPerMonth = {};
      const complaintMonth = {};
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
        totalCancelComplaintPerMonth[month] = 0;
        totalApprovedByHOComplaintPerMonth[month] = 0;
        totalRejectByHOComplaintPerMonth[month] = 0;
        totalRejectByVendorComplaintPerMonth[month] = 0;
        totalReworkStartComplaintPerMonth[month] = 0;
        totalReworkReqComplaintPerMonth[month] = 0;
        totalReworkEndComplaintPerMonth[month] = 0;
      });

      complaint.forEach((complaint) => {
        const month = new Date(complaint.created_at).toLocaleString('id-ID', {
          month: 'long',
        });
        const grandTotalPerMonth = Number(complaint.orders.grand_total);
        totalComplaintPerMonth[month]++;
        totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
        complaintMonth[month] = complaintMonth[month] || [];
        complaintMonth[month].push(complaint);

        if (!totalComplaintPerMonth[month]) {
          totalComplaintPerMonth[month] = 0;
        }

        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusCancel.category
        ) {
          totalCancelComplaintPerMonth[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusComplaintApprovedByHo.category
        ) {
          totalApprovedByHOComplaintPerMonth[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusComplaintApprovedByVendor.category
        ) {
          totalApprovedByVendorComplaintPerMonth[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusRejectByHo.category
        ) {
          statusRejectByHo[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusRejectByVendor.category
        ) {
          statusRejectByVendor[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusReworkStart.category
        ) {
          statusReworkStart[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusReworkReq.category
        ) {
          statusReworkReq[month]++;
        }
        if (
          complaint.status.category.toLocaleLowerCase() ===
          statusReworkEnd.category
        ) {
          statusReworkEnd[month]++;
        }
      });

      const monthlyComplaint = allMonths.map((month) => ({
        month,
        totalOrder: totalComplaintPerMonth[month] || 0,
        totalOrderGrandTotalPerMonth:
          totalComplaintGrandTotalPerMonth[month] || 0,
        totalCancelComplaint: totalCancelComplaintPerMonth[month] || 0,
        totalApprovedByHO: totalApprovedByHOComplaintPerMonth[month] || 0,
        totalApprovedByVendor:
          totalApprovedByVendorComplaintPerMonth[month] || 0,
        totalRejectByHo: totalRejectByHOComplaintPerMonth[month] || 0,
        totalRejectByVendor: totalRejectByVendorComplaintPerMonth[month] || 0,
        totalReworkStart: totalReworkStartComplaintPerMonth[month] || 0,
        totalReworkReq: totalReworkReqComplaintPerMonth[month] || 0,
        totalReworkEnd: totalReworkEndComplaintPerMonth[month] || 0,
        complaintMonth: complaintMonth[month] || [],
      }));

      return {
        data: complaint,
        meta: {
          complaintGrandTotal,
          monthlyComplaint,
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
        order_by,
        tukang_id,
        vendor_id,
      } = query;

      const statusCategories = {
        totalWaitingSurvey: ['SURVEYREQ', 'TUKANGSURVEY'],
        totalSurveyStart: ['SURVEYSTART'],
        totalSurveyDone: ['SURVEYDONE'],
        orderSurvey: ['SURVEYREQ', 'SURVEYSTART', 'SURVEYDONE'],
        totalPaidQuotation: ['UNPAIDQUOTATION'],
        totalWaitingWork: ['WORKREQ', 'TUKANGWORK'],
        totalWorkStart: ['WORKSTART'],
        totalCancel: ['CANCEL', 'CANCELREFUND'],
        orderWork: ['WORKREQ', 'WORKSTART', 'WORKDONE'],
        totalOrderDone: [
          'WORKEND',
        ],
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

     
      console.log(tukang_id);

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

      const total = await this.dbService.work_orders.count({
        where,
      });

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

      // console.log('Fetched orders:', orders);
      // console.log('Fetched complaints:', complaints);
      // console.log('Fetched reschedules:', reschedules);
      // console.log('Fetched refunds:', refunds);
      // console.log("Generated summary:", summary);
      // console.log("Generated report data:", reportData);

      // Return final report
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

  async reportTukang(query: QueryParamsDto) {
    try {
      const {
        date_from,
        vendor_id,
        date_to,
        page,
        search,
        take,
        search_date_from,
        search_date_to,
        service_types,
        area_id,
      } = query;
      const skip = page * take - take;

      const where: Prisma.tukangWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    {
                      tukang_area: {
                        some: {
                          area: {
                            area: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                    { address: { contains: search } },
                    { email: { contains: search } },
                    { phone_number: { contains: search } },
                    { full_name: { contains: search } },
                    { ktp_number: { contains: search } },
                    {
                      full_name: {
                        contains: search,
                      },
                    },
                    { vendor: { company_name: { contains: search } } },
                    {
                      tukang_service: {
                        some: {
                          service_type: { service_type: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          service_types
            ? {
                tukang_service: {
                  some: {
                    service_type_id: {
                      in: service_types,
                    },
                  },
                },
              }
            : undefined,
          area_id
            ? {
                tukang_area: {
                  some: {
                    area_id: {
                      in: area_id
                    },
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                vendor_id: vendor_id,
              }
            : undefined,
          search_date_from && search_date_to
            ? {
                join_date: {
                  gte: new Date(`${search_date_from}T00:00:00.000Z`),
                  lte: new Date(`${search_date_to}T23:59:59.000Z`),
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
        ],
        deleted_at: null,
      };
      const tukang = await this.dbService.tukang.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        include: {
          work_order_tukang: {
            where: { deleted_at: null },
            include: {
              work_orders: {
                include: {
                  order: {
                    include: {
                      quotation: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const tukangInvoiceSummary = await Promise.all(
        tukang.map(async (tukangItem) => {
          const totalInvoices = await this.dbService.invoices.aggregate({
            where: {
              invoice_details: {
                some: {
                  order: {
                    work_orders: {
                      work_order_tukang: {
                        some: {
                          tukang_id: tukangItem.id,
                        },
                      },
                    },
                  },
                },
              },
            },
            _sum: {
              total_amount: true,
            },
          });

          const totalQuotations = await this.dbService.quotation.aggregate({
            where: {
              order: {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukangItem.id,
                    },
                  },
                },
              },
            },
            _sum: {
              quotation_grand_total: true,
            },
          });

          return {
            tukang: tukangItem,
            totalInvoices: totalInvoices._sum?.total_amount || 0,
            totalQuotations: totalQuotations._sum?.quotation_grand_total || 0,
          };
        }),
      );

      return tukangInvoiceSummary;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async reportVendor(query: QueryParamsDto) {
    try {
      const vendors = await this.dbService.vendor.findMany({
        include: {
          orders: {
            include: {
              m_order_details: true,
            },
          },
        },
      });

      const vendorsSummary = vendors.map((vendor) => {
        const totalOrders = vendor.orders.length;
        const totalGrandTotal = vendor.orders.reduce((acc, order) => {
          return acc + Number(order.grand_total);
        }, 0);

        return {
          vendor,
          totalOrders: totalOrders,
          totalGrandTotal: totalGrandTotal,
        };
      });

      return vendorsSummary;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
