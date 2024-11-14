import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly httpService: HttpService,
  ) { }
  async create(createReportDto: CreateReportDto) { }
  async findAll() { }

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
                OR: [{
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
                },]
              }
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
        // comission_sales_incentive: {
        //   deleted_at:{
        //     not: null
        //   }
        // },
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
              bank: true
            },
          },
          incentive: true,
          quotation: {
            include: {
              order: {
                include: {
                  store: true,
                  members: true,
                  status: true,
                },
              },
            },
          },
          comission_sales_incentive: true
        },
      });
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
        totalRework: ['REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalReworkDone: ['REWORKEND'],
        totalResurvey: ['RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE'],
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
        totalRefund: [
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
                contains: 'INVESTIGATED',
              },
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
        // Tambahkan 7 jam ke waktu UTC
        const orderTimeInWIB = new Date(new Date(order.created_at).getTime() + 7 * 60 * 60 * 1000);

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

  async reportComplaint(query: QueryParamsDto) {
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
        totalComplaintInvestigated: ['INVESTIGATED'],
        totalComplaintApprovedByHo: ['COMPLAINTAPPROVEDBYHO'],
        totalComplaintRejectedByHo: ['COMPLAINTREJECTEDBYHO'],
        totalResurvey: ['RESURVEYREQ', 'RESURVEYSTART', 'RESURVEYDONE'],
        totalRework: ['REWORKREQ', 'REWORKSTART', 'REWORKEND'],
        totalSolved: ['SOLVED'],
        totalUnsolved: ['UNSOLVED'],
      };

      const summaryTemplate = {
        totalComplaint: 0,
        totalComplaintInvestigated: 0,
        totalComplaintApprovedByHo: 0,
        totalComplaintRejectedByHo: 0,
        totalResurvey: 0,
        totalRework: 0,
        totalSolved: 0,
        totalUnsolved: 0,
      };

      const isSameDay = date_from === date_to;
      const isSameMonth =
        new Date(date_from).getMonth() === new Date(date_to).getMonth() &&
        new Date(date_from).getFullYear() === new Date(date_to).getFullYear();
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
        ? Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
        : isSameMonth
          ? allDaysInMonth
          : Array.from({ length: 12 }, (_, i) =>
            new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
          );

      const summary = periods.reduce((acc, period) => {
        acc[period] = { ...summaryTemplate };
        return acc;
      }, {});

      const where: Prisma.complaintsWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : undefined,
          search
            ? {
              OR: [
                !isNaN(Number(search))
                  ? {
                    id: {
                      equals: Number(search),
                    },
                  }
                  : undefined,
                !isNaN(Number(search))
                  ? {
                    order_id: Number(search),
                  }
                  : undefined,
                {
                  complaint_channels: {
                    name: { contains: search },
                  },
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
                  orders: {
                    members: {
                      full_name: {
                        contains: search,
                      },
                    },
                  },
                },
                {
                  orders: {
                    store: {
                      store_name: search,
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
          store_id
            ? {
              orders: {
                store_id: {
                  in: store_id,
                },
              },
            }
            : undefined,
          vendor_id
            ? {
              orders: {
                vendor_id: {
                  equals: vendor_id,
                },
              },
            }
            : undefined,
          tukang_id
            ? {
              orders: {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukang_id,
                    },
                  },
                },
              },
            }
            : undefined,
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : undefined,
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
      };

      const complaints = await this.dbService.complaints.findMany({
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          status: true,
          orders: {
            include: {
              status: true,
            },
          },
        },
      });

      complaints.forEach((complaint) => {
        const complaintWib = new Date(new Date(complaint.created_at).getTime() + 7 * 60 * 60 * 1000);

        const period = isSameDay
          ? complaintWib.toLocaleString('id-ID', {
            hour: '2-digit',
            hour12: false,
          })
          : isSameMonth
            ? complaintWib.toLocaleString('id-ID', {
              day: '2-digit',
            })
            : complaintWib.toLocaleString('id-ID', {
              month: 'long',
            });

        if (summary[period]) {
          const { category } = complaint.status;

          if (statusCategories.totalComplaintInvestigated.includes(category)) {
            summary[period].totalComplaintInvestigated++;
          }

          if (statusCategories.totalComplaintApprovedByHo.includes(category)) {
            summary[period].totalComplaintApprovedByHo++;
          }

          if (statusCategories.totalComplaintRejectedByHo.includes(category)) {
            summary[period].totalComplaintRejectedByHo++;
          }

          if (
            statusCategories.totalResurvey.includes(
              complaint.orders.status.category,
            )
          ) {
            summary[period].totalResurvey++;
          }

          if (
            statusCategories.totalRework.includes(
              complaint.orders.status.category,
            )
          ) {
            summary[period].totalRework++;
          }

          if (category === 'SOLVED') {
            summary[period].totalSolved++;
          }

          if (category === 'UNSOLVED') {
            summary[period].totalUnsolved++;
          }
        }
      });

      // Ensure all periods are accounted for
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
      const count = await this.dbService.complaints.count({ where });

      // Return final report
      return {
        data: reportData,
        meta: {
          total: count,
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
                    in: area_id,
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

  async generalReport(queryParams: QueryParamsDto, res: Response) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        sales_id,
        payment_type,
        store_id,
        vendor_id,
        work_order_status,
        is_invoice,
        is_active_warranty,
        tukang_id,
        is_expired_warranty,
        is_used_warranty,
        is_receipt,
        is_receipt_quotation,
        promotion,
        is_promotion,
        history_status,
      } = queryParams;

      if (!date_from && date_to) {
        throw new BadRequestException('Mohon untuk menginput date from dan date to!')
      }

      const skip = page * take - take;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  { members: { full_name: { contains: search } } },
                  {
                    store: {
                      store_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    project_number: {
                      contains: search,
                    },
                  },
                  {
                    vendor: {
                      company_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      phone_number: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      whatsapp_number: {
                        contains: search,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(history_status
            ? [
              {
                order_history: {
                  some: {
                    status_id: {
                      in: history_status,
                    },
                  },
                },
              },
            ]
            : []),
          ...(is_promotion
            ? [
              {
                OR: [
                  {
                    AND: [
                      {
                        payment_type: 'gratis',
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        quotation: {
                          some: {
                            promotion_id: {
                              not: null,
                            },
                          },
                        },
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                ],
              },
            ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(work_order_status
            ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
            : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          store_id
            ? {
              store_id: {
                in: store_id,
              },
            }
            : undefined,
          vendor_id
            ? {
              vendor: {
                id: vendor_id,
                deleted_at: null,
              },
            }
            : undefined,
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
          ...(Boolean(is_invoice)
            ? [
              {
                invoice_details: {
                  none: {
                    deleted_at: null,
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_active_warranty)
            ? [
              {
                work_orders: {
                  work_order_status: {
                    some: {
                      status: {
                        category: 'WORKEND',
                      },
                      created_at: {
                        gte: sevenDaysAgo,
                      },
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_expired_warranty)
            ? [
              {
                OR: [
                  {
                    work_orders: {
                      work_order_status: {
                        some: {
                          status: {
                            category: 'WORKEND',
                          },
                          created_at: {
                            lt: sevenDaysAgo,
                          },
                        },
                      },
                    },
                  },
                  {
                    complaints: {
                      some: {
                        deleted_at: null,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(Boolean(is_receipt)
            ? [
              {
                receipt_number: {
                  not: null,
                },
              },
            ]
            : []),
          ...(is_receipt_quotation
            ? [
              {
                quotation: {
                  some: {
                    receipt_quotation: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(promotion)
            ? [
              {
                quotation: {
                  some: {
                    promotion_id: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_used_warranty)
            ? [{ complaints: { some: { deleted_at: null } } }]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Installation Booking');

      const data = await this.dbService.orders.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          refund: {
            where: {
              deleted_at: null
            }
          },
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              area_id: true,
              area: true,
              join_location: true,
              member_number: true,
              full_name: true,
              email: true,
              phone_number: true,
              whatsapp_number: true,
              address_1: true,
              address_2: true,
              zip_code: true,
              rating: true,
              join_date: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoice_number: true,
              total: true,
              type: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
            },
          },
          complaints: {
            include: {
              complaint_histories: {
                include: {
                  complaint_evidence: true,
                },
              },
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              order_id: true,
              item_code: true,
              item_name: true,
              item_notes: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  type: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                  prices: {
                    where: {
                      deleted_at: null,
                      periodic_start: { lte: new Date() },
                      periodic_end: { gte: new Date() },
                    }
                  }
                },
              },
              sales: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            orderBy: {
              created_at: 'desc'
            },
            include: {
              promotion: true,
              quotation_receipt: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
        },
      });


      if (data.length === 0) throw new NotFoundException('Order data not found');

      const itemMap = new Map();

      data.forEach(order => {
        order.m_order_details.forEach(detail => {
          if (detail?.item?.type === 1 || detail?.item?.type === 2) {
            const quantity = detail?.quantity || 0;
            const type = detail?.item?.type;

            if (itemMap.has(type)) {
              const itemData = itemMap.get(type);
              itemData.quantity += quantity;
              itemData.orderCount += 1;
              itemMap.set(type, itemData);
            } else {
              itemMap.set(type, { quantity: quantity, orderCount: 1, type: type });
            }
          }
        });
      });
      interface Item {
        itemName: string;
        quantity: number;
        orderCount: number;
        type: number;
      }

      const allItems = Array.from(itemMap.values());

      const bookReceived = data.filter((x) =>
        x.status.category != 'PICKLIST'
      ).length;

      const orderDone = data.filter((x) =>
        x.status.category === 'WORKEND' || x.status.category === 'SURVEYDONE' || x.status.category === 'WORKENDSTEPONE' || x.status.category === 'WORKENDSTEPTWO' || x.status.category === 'WORKENDSTEPTHREE'
      ).length;

      const currentDate = new Date(date_from);

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 2);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 2);
      const endOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 2);
      
      startOfMonth.setHours(0, 0, 0, 0);
      endOfMonth.setHours(0, 0, 0, 0);
      nextMonth.setHours(0, 0, 0, 0);
      endOfNextMonth.setHours(0, 0, 0, 0);
      
      const orderPending = data.filter((x) =>
        (
          x.status.category === 'WORKREQ' ||
          x.status.category === 'SURVEYREQ' ||
          x.status.category === 'WORKREQSTEPONE' ||
          x.status.category === 'WORKREQSTEPTWO' ||
          x.status.category === 'WORKREQSTEPTHREE'
        ) &&
        (
          (new Date(x.request_survey) >= startOfMonth && new Date(x.request_survey) <= endOfMonth) ||
          (new Date(x.request_work) >= startOfMonth && new Date(x.request_work) <= endOfMonth)
        )
    ).length;

      const orderRefund = data.filter((x) =>
        x.refund.length > 0
      ).length;

      const orderCancel = data.filter((x) =>
        x.refund.length > 0 || x.status.category === 'CANCELREFUND' || x.status.category === 'CANCEL'
      ).length;


      const totalProgressOrder = [
        'COMPLAINT',
        'REFUND',
        'RESCHEDULE',
        'WORKEND',
        'WORKENDSTEPONE',
        'WORKENDSTEPTWO',
        'WORKENDSTEPTHREE',
        'QUOTEIN'
      ];

      const orderProgress = data.filter((x) =>
        !totalProgressOrder.includes(x.status.category) && new Date(x.request_survey) >= nextMonth &&
        new Date(x.request_survey) <= endOfNextMonth || new Date(x.request_work) >= nextMonth &&
        new Date(x.request_work) <= endOfNextMonth
      ).length;

      const orderSurvey = data.filter((x) =>
        x.payment_type === 'survey'
      ).length;

      const quotationPaid = data.filter((x) => x?.quotation[0]?.receipt_quotation != null || x?.quotation[0]?.quotation_receipt.length > 0 && x.payment_type === 'survey').length;
      const quotationPaidValue = data
        .filter((x) => x?.quotation[0]?.receipt_quotation != null || x?.quotation[0]?.quotation_receipt.length > 0 && x.payment_type === 'survey')
        .reduce((total, order) => {
          const grandTotal = Number(order.quotation[0]?.quotation_grand_total || 0);
          return total + grandTotal;
        }, 0);

        const quotationUnpaid = data.filter((x) => 
          (
            x?.quotation[0]?.receipt_quotation === null || 
            (x.quotation[0]?.quotation_special === 1 && x?.quotation[0]?.quotation_receipt && x.quotation[0].quotation_receipt.length === 0)
          ) &&
          x.payment_type === 'survey'
      ).length;
      const quotationUnpaidValue = data
        .filter((x) => x?.quotation[0]?.receipt_quotation === null || x?.quotation[0]?.quotation_receipt.length === 0 && x.payment_type === 'survey')
        .reduce((total, order) => {
          const grandTotal = Number(order.quotation[0]?.quotation_grand_total || 0);
          return total + grandTotal;
        }, 0);
        
      const orderSurveyOnGoing = data.filter((x) =>
        x.status.category === 'SURVEYREQ' || x.status.category === 'SURVEYSTART' && x.payment_type === 'survey'
      ).length;
      const orderSurveyNoQuotation = data.filter((x) =>
        x.payment_type === 'survey' && x.quotation.length === 0 && x.status.category === 'SURVEYDONE'
      ).length;

      const dateFrom = new Date(date_from);
      const dateTo = new Date(date_to);

      const formattedDateFrom = dateFrom.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const formattedDateTo = dateTo.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      const titleCell = worksheet.getCell('A1');
      worksheet.getRow(1).height = 40;
      titleCell.value = `Installation Service: ${formattedDateFrom} - ${formattedDateTo}`;

      titleCell.font = { size: 16, bold: true, color: { argb: 'FF0000FF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF' },
      };
      worksheet.mergeCells('A1:F1');

      worksheet.addRow(['Installation Booking', '', 'Survey', '', `Job Done: ${orderDone}`]);

      const headerRow = worksheet.getRow(2);
      headerRow.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { horizontal: 'center' };

      headerRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };
      headerRow.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };
      headerRow.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF17365D' },
      };

      const example = [];

      example.push([
        `Booking Received: ${bookReceived}`,
        '',
        `Survey: ${orderSurvey}`,
        '',
        `Add Program`
      ]);

      interface Status {
        label: string;
        value: string | number;
        quotationLabel: string;
        quotationValue: string | number;
        itemLabel: string | number;
        itemValue: string | number;
      }



      const currentMonth = dateFrom.toLocaleString('default', { month: 'long' });

      const nextMonthDate = new Date(dateFrom.getFullYear(), dateFrom.getMonth() + 1);
      const nextMonthName = nextMonthDate.toLocaleString('default', { month: 'long' });

      const freeSummary = allItems.find(item => item.type === 1) || { orderCount: 0, quantity: 0 };
      const installationSummary = allItems.find(item => item.type === 2) || { orderCount: 0, quantity: 0 };

      // Periksa apakah freeSummary dan installationSummary memiliki nilai yang benar

      const statuses: Status[] = [
        { label: 'Done', value: orderDone, quotationLabel: 'Survey & Implementation', quotationValue: quotationPaid, itemLabel: `FREE(${freeSummary?.orderCount})`, itemValue: freeSummary?.quantity || 0 },
        { label: `Pending (Req Date ${currentMonth})`, value: orderPending, quotationLabel: 'Total Value', quotationValue: quotationPaidValue, itemLabel: `PEMASANGAN TANPA SURVEY(${installationSummary?.orderCount})`, itemValue: installationSummary?.quantity || 0 },
        { label: 'Refund', value: orderRefund, quotationLabel: 'Survey & Quotation', quotationValue: quotationUnpaid, itemLabel: '', itemValue: '' },
        { label: 'Cancel', value: orderCancel, quotationLabel: 'Total Value', quotationValue: quotationUnpaidValue, itemLabel: '', itemValue: '' },
        { label: `On Going (Req Date ${nextMonthName})`, value: orderProgress, quotationLabel: 'Survey On Going', quotationValue: orderSurveyOnGoing, itemLabel: '', itemValue: '' },
        { label: '', value: '', quotationLabel: 'Survey & No Quotation', quotationValue: orderSurveyNoQuotation, itemLabel: '', itemValue: '' },
        { label: '', value: '', quotationLabel: '', quotationValue: '', itemLabel: '', itemValue: '' },
        { label: '', value: '', quotationLabel: '', quotationValue: '', itemLabel: '', itemValue: '' }
      ];

      const maxLength = statuses.length;

      for (let i = 0; i < maxLength; i++) {
        const status = statuses[i] || {} as Status;
        const statusText = status.label ? `${status.label}: ${status.value}` : '';
        const quotationText = status.quotationLabel ? `${status.quotationLabel}: ${status.quotationValue}` : '';
        const itemText = status.itemLabel ? `${status.itemLabel}: ${status.itemValue}` : '';

        const row = [
          { richText: [{ text: statusText || '', font: { argb: 'FF000000' } }] },
          '',
          { richText: [{ text: quotationText || '', font: { argb: 'FF000000' } }] },
          '',
          { richText: [{ text: itemText || '', font: { argb: 'FF000000' } }] },
          ''
        ];

        example.push(row);
      }

      example.forEach(row => {
        const newRow = worksheet.addRow(row);
        newRow.font = { size: 12 };
        newRow.alignment = { horizontal: 'left' };
      });

      worksheet.addRow([]);

      worksheet.getColumn(1).width = 45;
      worksheet.getColumn(2).width = 15;
      worksheet.getColumn(3).width = 45;
      worksheet.getColumn(4).width = 15;
      worksheet.getColumn(5).width = 50;
      worksheet.getColumn(6).width = 25;

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {};
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
        const folderPath = './storage/excel/order';
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
        const baseName = `DataOrder-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return await generateExcelFile(res);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}
