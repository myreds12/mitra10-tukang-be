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
      const { sales_id, store_id, page, take, date_from, date_to, status } =
        query;
      const skip = page * take - take;
      const where: Prisma.sales_incentiveWhereInput = {
        AND: [
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
                  status: true
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
        tukang_id
      } = query;

      const statusCategories = {
        totalPicklist: ['PICKLIST'],
        totalNewOrder: ['PICKLIST', 'BOOKED', 'BOOK'],
        totalWaitingSurvey: ['SURVEYREQ'],
        totalSurveyStart: ['SURVEYSTART'],
        totalSurveyEnd: ['SURVEYEND'],
        orderSurvey: ['SURVEYREQ', 'SURVEYSTART', 'SURVEYDONE'],
        totalUnpaidReceipt: ['UNPAIDRECEIPT'],
        totalUnpaidQuotation: ['UNPAIDQUOTATION'],
        totalWaitingQuotationVendor: ['QUOTEIN'],
        totalWaitingQuotationCustomer: ['QUOTEOUT'],
        totalWaitingQuotation: ['QUOTEIN', 'QUOTEOUT'],
        totalWaitingWork: ['WORKREQ'],
        totalWIP: ['WORKSTART'],
        orderWork: ['WORKREQ', 'WORKSTART', 'WORKDONE'],
        totalOrderComplaint: ['WARRANTYCLAIM'],
        totalRework: ['REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalReworkDone: ['REWORKEND'],
        totalResurvey: ['RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE'],
        totalResurveyDone: ['RESURVEYDONE'],
        totalOrderDone: ['WORKEND', 'INVOICEDRAFT', 'INVOICE', 'INVOICESEND', 'DONE'],
        totalCancel: ['CANCEL'],
        totalProgressOrder: ['BOOKED', 'BOOK', 'PICKLIST', 'SURVEYREQ', 'SURVEYSTART', 'SURVEYEND', 'SURVEYDONE', 'UNPAIDRECEIPT', 'WORKREQ', 'WORKSTART', 'WORKEND', 'QUOTEIN', 'QUOTEOUT', 'UNPAID', 'PAID', 'INVESTIGATED', 'RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYEND', 'REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalComplaintApprovedByHo: ['COMPLAINTAPPROVEDBYHO'],
        totalComplaintRejectedByHo: ['COMPLAINTREJECTEDBYHO'],
        totalComplaint: ['COMPLAINT'],
        totalReschedule: ['RESCHEDULE'],
        totalRefund: ['REFUND'],
        totalWaitingResolve: ['INVESTIGATED'],
        totalActiveWarranty: ['ACTIVEWARRANTY'],
        totalUsedWrranty: ['USEDWARRANTY'],
        totalExpiredWarranty: ['EXPIREDWARRANTY'],
      };

      // Determine if it's the same day report, same month report, or monthly report
      const isSameDay = date_from === date_to;
      const isSameMonth = new Date(date_from).getMonth() === new Date(date_to).getMonth() && new Date(date_from).getFullYear() === new Date(date_to).getFullYear();
      const allHours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
      const allMonths = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const allDaysInMonth = Array.from({ length: new Date(new Date(date_from).getFullYear(), new Date(date_from).getMonth() + 1, 0).getDate() }, (_, i) => (i + 1).toString().padStart(2, '0'));
      const periods = isSameDay ? allHours : (isSameMonth ? allDaysInMonth : allMonths);
      console.log(periods);

      // Initialize summary template and summary object
      const summaryTemplate = {
        totalOrder: 0,
        totalOrderGrandTotal: 0,
        totalPicklist: 0,
        totalNewOrder: 0,
        totalWaitingSurvey: 0,
        totalSurveyStart: 0,
        totalSurveyEnd: 0,
        orderSurvey: 0,
        totalUnpaidReceipt: 0,
        totalUnpaidQuotation: 0,
        totalWaitingQuotation: 0,
        totalWaitingQuotationVendor: 0,
        totalWaitingQuotationCustomer: 0,
        totalWaitingWork: 0,
        totalWIP: 0,
        orderWork: 0,
        totalOrderComplaint: 0,
        totalRework: 0,
        totalResurvey: 0,
        totalOrderDone: 0,
        totalCancel: 0,
        totalProgressOrder: 0,
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

      console.log(summary, "SUMMARY");

      // Build where clause for Prisma query
      const where = {
        AND: [
          ...(date_from && date_to ? [
            {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            },
          ] : []),
          ...(search ? [
            {
              OR: [
                { receipt_number: { contains: search } },
                { request_survey: { equals: new Date(search) } },
                { members: { full_name: { contains: search } } },
              ],
            },
          ] : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(member_id ? [{ member_id: { equals: member_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          ...(store_id ? [{ store_id: { in: store_id } }] : []),
          ...(vendor_id ? [
            {
              vendor: {
                id: {
                  equals: vendor_id,
                },
                deleted_at: null,
              },
            },
          ] : []),
          ...(tukang_id ? [
            {
              work_orders: {
                work_order_tukang: {
                  some: {
                    tukang_id: tukang_id
                  }
                }
              }
            }
          ] : []),
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
          complaints: true,
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
            created_at: {
              gte: new Date(date_from),
              lte: new Date(`${date_to}T23:59:59.000Z`),
            },
          },
        }),
        this.dbService.reschedule.findMany({
          where: {
            created_at: {
              gte: new Date(date_from),
              lte: new Date(`${date_to}T23:59:59.000Z`),
            },
          },
        }),
        this.dbService.refund.findMany({
          ...(date_from && date_to ? {
            where: {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            },
          } : undefined)
        }),
      ]);

      // Process data into summary
      const H_PLUS_7_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = new Date();

      orders.forEach((order) => {
        const period = isSameDay
          ? new Date(order.created_at).toLocaleString('id-ID', { hour: '2-digit', hour12: false })
          : (isSameMonth
            ? new Date(order.created_at).toLocaleString('id-ID', { day: '2-digit' })
            : new Date(order.created_at).toLocaleString('id-ID', { month: 'long' })
          );

        if (summary[period]) {

          summary[period].totalOrder++;
          summary[period].totalOrderGrandTotal += Number(order.grand_total);

          Object.entries(statusCategories).forEach(([key, statuses]) => {
            if (statuses.includes(order.status.category)) {
              summary[period][key]++;
            }
          });

          if (order.receipt_number === null) {
            summary[period].totalUnpaidReceipt++;
          }

          if (
            (order.payment_type === 'survey' ||
              order.payment_type === 'pemasangan_tanpa_survey') &&
            order?.quotation[0]?.receipt_quotation === null
          ) {
            summary[period].totalUnpaidQuotation++;
          }

          const workEndDate = new Date(order.created_at);
          const warrantyExpirationDate = new Date(workEndDate.getTime() + H_PLUS_7_DAYS);

          if (order.status.category === 'WORKEND') {
            if(order.complaints){
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

      // Update summary with complaints, reschedules, and refunds data
      [complaints, reschedules, refunds].forEach((entityList, index) => {
        const entityNames = ['totalComplaint', 'totalReschedule', 'totalRefund'];
        entityList.forEach((entity) => {
          const period = isSameDay
            ? new Date(entity.created_at).toLocaleString('id-ID', { hour: '2-digit', hour12: false })
            : (isSameMonth
              ? new Date(entity.created_at).toLocaleString('id-ID', { day: '2-digit' })
              : new Date(entity.created_at).toLocaleString('id-ID', { month: 'long' })
            );

          if (summary[period]) {
            summary[period][entityNames[index]]++;
          }
        });
      });

      // Ensure all periods are accounted for, even if empty
      periods.forEach(period => {
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

      console.log("Fetched orders:", orders);
      console.log("Fetched complaints:", complaints);
      console.log("Fetched reschedules:", reschedules);
      console.log("Fetched refunds:", refunds);
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
      console.log(where);

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
      const { status, date_from, date_to, order_by, member_id, vendor_id } =
        query;
      console.log(status);
      const statuses = await this.dbService.status.findMany();

      const statusWorkReq = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('workreq'),
      );
      const statusWorkStart = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('workstart'),
      );
      // const statusWIP = statuses.find((i) =>
      //   i.category.toLocaleLowerCase().includes('wip'),
      // );
      const statusWorkEnd = statuses.find((i) =>
        i.category.toLocaleLowerCase().includes('workend'),
      );

      const where: Prisma.work_ordersWhereInput = {
        AND: [
          ...(member_id
            ? [
                {
                  order: {
                    member_id: {
                      equals: member_id,
                    },
                  },
                },
              ]
            : []),
          ...(vendor_id
            ? [
                {
                  vendor_id: {
                    equals: vendor_id,
                  },
                },
              ]
            : []),
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

      const workOrders = await this.dbService.work_orders.findMany({
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          status: true,
        },
      });
      const count = await this.dbService.work_orders.count({
        where,
      });
      const totalWorkOrdersPerMonth = {};
      const ordersMonth = {};
      const totalCompleteOrderPerMonth = {};
      const totalWorkStartWorkOrdersPerMonth = {};
      // const totalWIPOrderPerMonth = {};
      const totalWorkEndOrderPerMonth = {};
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
        totalWorkStartWorkOrdersPerMonth[month] = 0;
        totalCompleteOrderPerMonth[month] = 0;
        // totalWIPOrderPerMonth[month] = 0;
        totalWorkEndOrderPerMonth[month] = 0;
      });

      workOrders.forEach((order) => {
        const month = new Date(order.created_at).toLocaleString('id-ID', {
          month: 'long',
        });

        if (!totalWorkOrdersPerMonth[month]) {
          totalWorkOrdersPerMonth[month] = 0;
        }

        totalWorkOrdersPerMonth[month]++;
        ordersMonth[month] = ordersMonth[month] || [];
        ordersMonth[month].push(order);

        if (order.status.category === statusWorkReq.category) {
          totalCompleteOrderPerMonth[month]++;
        }
        if (order.status.category === statusWorkStart.category) {
          totalWorkStartWorkOrdersPerMonth[month]++;
        }
        // if (order.status.category === statusWIP.category) {
        //   totalWIPOrderPerMonth[month]++;
        // }
        if (order.status.category === statusWorkEnd.category) {
          totalWorkEndOrderPerMonth[month]++;
        }
      });
      const grandTotalSurveyOrderPerMonth = {};
      allMonths.forEach((month) => {
        grandTotalSurveyOrderPerMonth[month] = ordersMonth[month]
          ? ordersMonth[month].filter((order) =>
              order.status.category.includes('survey'),
            ).length
          : 0;
      });

      const monthlyWorkOrders = allMonths.map((month) => ({
        month,
        totalOrder: totalWorkOrdersPerMonth[month] || 0,
        totalCompleteOrder: totalCompleteOrderPerMonth[month] || 0,
        totalUnpaidOrder: totalWorkStartWorkOrdersPerMonth[month] || 0,
        totalWorkEndOrder: totalWorkEndOrderPerMonth[month] || 0,
        totalSurveyOrder: grandTotalSurveyOrderPerMonth[month] || 0,
        workOrdersMonth: ordersMonth[month] || [],
      }));

      return {
        data: workOrders,
        meta: {
          total: count,
          monthlyWorkOrders,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async reportTukang(query: QueryParamsDto) {
    try {
      const tukang = await this.dbService.tukang.findMany({
        where: {
          deleted_at: null,
        },
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
