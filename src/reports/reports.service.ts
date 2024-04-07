import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { FormDto } from './dto/create-form.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { log } from 'console';
import { currentLineHeight } from 'pdfkit';

@Injectable()
export class ReportsService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
    private readonly httpService: HttpService
  ) { }
  async create(createReportDto: CreateReportDto) {

  }
  //"1wLn20ycyAoKKyzZdSkoAfB2rPEjkTPG_ZWHzA6fVZaw"
  async findAll() {

  }

  async salesComissionReport(query: QueryParamsDto) {
    const {
      sales_id,
    } = query;
    const where: Prisma.ordersWhereInput = {
      AND: [
        ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
      ].filter(Boolean),
      deleted_at: null,
    };
    const order = await this.dbService.orders.findMany({
      where,
      orderBy: {
        created_at: "desc"
      },
      include: {
        members: true,
        sales: true,
        status: true,
        vendor: true,
        store: true,
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
                category: true,
                prices: true,
                default_price: true,
                service_name: true,
              },
            },
            unit_price: true,
            quantity: true,
            total: true,
            comission: true,
            created_by: true,
            updated_by: true,
            created_at: true,
            updated_at: true,
          },
        },
        quotation: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          include: {
            quotation_details: {
              include: {
                item: true,
              },
            },
          },
        },
        order_files: true,
        complaints: true,
        work_orders: {
          include: {
            vendor: true,
            work_order_evidences: true,
            work_order_tukang: {
              include: {
                tukang: true,
              },
              where: {
                deleted_at: null,
                deleted_by: null,
              },
            },
            work_order_status: {
              include: {
                status: true,
                work_order_items: {
                  include: {
                    item: true,
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
          },
        },
      },
    });
    // console.log(sales);

    return order;
  }

  findOne(id: number) {
    return `This action returns a #${id} report`;
  }

  update(id: number, updateReportDto: UpdateReportDto) {
    return `This action updates a #${id} report`;
  }

  remove(id: number) {
    return `This action removes a #${id} report`;
  }

  async createForm(dto: FormDto) {
    const url = "https://forms.googleapis.com/v1/forms"
    const request = {
      "info": {
        "title": "Tukang",
        "description": ""
      },
      "items": [
        {
          "title": "ex1",
          "questionItem": {
            "question": {
              "required": false,
              "textQuestion": {
                "paragraph": false
              }
            }
          }
        }
      ]
    }

    const access_token = "https://www.googleapis.com/oauth2/v1/certs"

    const headers = {
      "Authorization": `Bearer ${access_token}`,
    };

    const response = await this.httpService.post(url, request, { headers })

    return response
  }

  async reportOrder(query: QueryParamsDto) {
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
      invoice_status,
      member_id
    } = query;
    console.log(status);
    const statuses = await this.dbService.status.findMany();

    const statusDone = statuses.find((i) => i.category.toLocaleLowerCase().includes("done"));
    const statusUnpaid = statuses.find((i) => i.category.toLocaleLowerCase().includes("unpaid"));
    const statusSurveyStart = statuses.find((i) => i.category.toLocaleLowerCase().includes("surveystart"));
    const statusSurveyReq = statuses.find((i) => i.category.toLocaleLowerCase().includes("surveyreq"));
    const statusSurveyDone = statuses.find((i) => i.category.toLocaleLowerCase().includes("surveydone"));


    const where: Prisma.ordersWhereInput = {
      AND: [
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
        ...(store_id ? [{
          store_id: {
            in: store_id
          }
        }] : []),
        vendor_id
          ? {
            vendor: {
              id: {
                equals: vendor_id
              },
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
      ].filter(Boolean),
      deleted_at: null,
    };

    const orders = await this.dbService.orders.findMany({
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
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
            join_location_store: true,
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
        sales: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          select: {
            id: true,
            store_id: true,
            user_id: true,
            full_name: true,
            nik: true,
            bank_id: true,
            bank_branch: true,
            account_name: true,
            is_active: true,
            created_at: true,
            updated_at: true,
            created_by: true,
            updated_by: true,
          },
        },
        invoice_orders: {
          select: {
            id: true,
            invoice_id: true,
            invoices: true
          }
        },
        store: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          select: {
            id: true,
            store_name: true,
            address: true,
            area_id: true,
            area: true,
            zip_code: true,
            created_at: true,
            updated_at: true,
            created_by: true,
            updated_by: true,
          },
        },
        status: {
          select: {
            id: true,
            category: true,
            description: true,
          },
        },
        complaints: true,
        vendor: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          select: {
            id: true,
            user_id: true,
            company_name: true,
            address: true,
            phone_number: true,
            ktp_number: true,
            npwp_number: true,
            email_address: true,
            join_date: true,
            is_active: true,
            created_at: true,
            updated_at: true,
            created_by: true,
            updated_by: true,
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
                category: true,
                default_price: true,
                service_name: true,
              },
            },
            sales: true,
            unit_price: true,
            quantity: true,
            total: true,
            comission: true,
            created_by: true,
            updated_by: true,
            created_at: true,
            updated_at: true,
          },
        },
        quotation: {
          where: {
            deleted_at: null,
            deleted_by: null,
          },
          include: {
            quotation_details: {
              include: {
                item: true,
              },
            },
          },
        },
        work_orders: {
          include: {
            vendor: true,
            work_order_evidences: true,
            work_order_tukang: {
              include: {
                tukang: true,
              },
              where: {
                deleted_at: null,
                deleted_by: null,
              },
            },
            work_order_status: {
              include: {
                status: true,
                work_order_items: {
                  include: {
                    item: true,
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
          },
        },
        order_files: true,
      },
    });


    const count = await this.dbService.orders.count();
    const orderGrandTotal = await this.dbService.orders
      .aggregate({
        _sum: {
          grand_total: true,
        },
      })
      .then((data) => data._sum.grand_total);
    const totalOrdersPerMonth = {};
    const ordersMonth = {};
    const totalOrderGrandTotalPerMonth = {};
    const totalCompleteOrderPerMonth = {};
    const totalUnpaidOrderPerMonth = {};
    const totalSurveyStartOrderPerMonth = {};
    const totalSurveyReqOrderPerMonth = {};
    const totalSurveyDoneOrderPerMonth = {};
    const allMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    allMonths.forEach(month => {
      totalOrderGrandTotalPerMonth[month] = 0;
      totalUnpaidOrderPerMonth[month] = 0;
      totalCompleteOrderPerMonth[month] = 0;
      totalSurveyStartOrderPerMonth[month] = 0;
      totalSurveyReqOrderPerMonth[month] = 0;
      totalSurveyDoneOrderPerMonth[month] = 0;
    });

    orders.forEach(order => {
      const month = new Date(order.created_at).toLocaleString('id-ID', { month: 'long' });
      const grandTotalPerMonth = Number(order.grand_total);

      console.log(order, "ORDER", order.status.category, "ORDER STATUS");


      if (!totalOrdersPerMonth[month]) {
        totalOrdersPerMonth[month] = 0;
      }

      totalOrdersPerMonth[month]++;
      totalOrderGrandTotalPerMonth[month] += grandTotalPerMonth;
      ordersMonth[month] = ordersMonth[month] || [];
      ordersMonth[month].push(order);

      if (order.status.category === statusDone.category) {
        totalCompleteOrderPerMonth[month]++;
      }
      if (order.status.category === statusUnpaid.category) {
        totalUnpaidOrderPerMonth[month]++;
      }
      if (order.status.category === statusSurveyStart.category) {
        totalSurveyStartOrderPerMonth[month]++;
      }
      if (order.status.category === statusSurveyDone.category) {
        totalSurveyDoneOrderPerMonth[month]++;
      }
      if (order.status.category === statusSurveyReq.category) {
        totalSurveyReqOrderPerMonth[month]++;
      }
    });

    const monthlyOrders = allMonths.map(month => ({
      month,
      totalOrder: totalOrdersPerMonth[month] || 0,
      totalOrderGrandTotalPerMonth: totalOrderGrandTotalPerMonth[month] || 0,
      totalCompleteOrder: totalCompleteOrderPerMonth[month] || 0,
      totalUnpaidOrder: totalUnpaidOrderPerMonth[month] || 0,
      totalSurveyStartOrder: totalSurveyStartOrderPerMonth[month] || 0,
      totalSurveyReqOrder: totalSurveyReqOrderPerMonth[month] || 0,
      totalSurveyDoneOrder: totalSurveyDoneOrderPerMonth[month] || 0,
      ordersMonth: ordersMonth[month] || [],

    }));

    return {
      data: orders,
      total: count,
      orderGrandTotal,
      takeTotal: orders.length,
      monthlyOrders,
    };
  }


  async complaintReport(queryParamsDto: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by, member_id, vendor_id } = queryParamsDto;
    const skip = page * take - take;

    const statuses = await this.dbService.status.findMany();
    console.log(statuses);
    

    const statusCancel = statuses.find((i) => i.category.toLocaleLowerCase().includes("cancel"));
    const statusComplaintApprovedByHo = statuses.find((i) => i.category.toLocaleLowerCase().includes("complaintapprovedbyho"));
    const statusComplaintApprovedByVendor = statuses.find((i) => i.category.toLocaleLowerCase().includes("complaintapprovedbyvendor"));
    const statusRejectByHo = statuses.find((i) => i.category.toLocaleLowerCase().includes("rejectbyho"));
    const statusRejectByVendor = statuses.find((i) => i.category.toLocaleLowerCase().includes("rejectbyvendor"));
    const statusReworkStart = statuses.find((i) => i.category.toLocaleLowerCase().includes("reworkstart"));
    const statusReworkReq = statuses.find((i) => i.category.toLocaleLowerCase().includes("reworkreq"));
    const statusReworkEnd = statuses.find((i) => i.category.toLocaleLowerCase().includes("reworkend"));
    const where: Prisma.complaintsWhereInput = {
      AND: [
        status ? { status: { id: { in: status } } } : null,
        search ? { complaint_channels: { name: { contains: search } } } : null,
        ...(member_id ? [{
          orders: {
            member_id: member_id
          }
        }] : []),
        ...(vendor_id ? [{
          orders: {
            vendor_id: {
              equals: vendor_id
            }
          }
        }] : []),
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
    const complaintGrandTotal = await this.dbService.complaints.findMany({
      include: {
        orders: true,
      }
    }).then((data) => data.reduce((acc, curr) => acc + Number(curr.orders.grand_total), 0));
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
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    allMonths.forEach(month => {
      totalComplaintGrandTotalPerMonth[month] = 0;
    });

    complaint.forEach(complaint => {
      const month = new Date(complaint.created_at).toLocaleString('id-ID', { month: 'long' });
      const grandTotalPerMonth = Number(complaint.orders.grand_total);

      if (!totalComplaintPerMonth[month]) {
        totalComplaintPerMonth[month] = 0;
      }

      if (complaint.status.category.toLocaleLowerCase() === statusCancel.category) {
        totalCancelComplaintPerMonth[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusComplaintApprovedByHo.category) {
        totalApprovedByHOComplaintPerMonth[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusComplaintApprovedByVendor.category) {
        totalApprovedByVendorComplaintPerMonth[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusRejectByHo.category) {
        statusRejectByHo[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusRejectByVendor.category) {
        statusRejectByVendor[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusReworkStart.category) {
        statusReworkStart[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusReworkReq.category) {
        statusReworkReq[month]++;
      }
      if (complaint.status.category.toLocaleLowerCase() === statusReworkEnd.category) {
        statusReworkEnd[month]++;
      }

      totalComplaintPerMonth[month]++;
      totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
      complaintMonth[month] = complaintMonth[month] || [];
      complaintMonth[month].push(complaint);
    });

    const monthlyComplaint = allMonths.map(month => ({
      month,
      totalOrder: totalComplaintPerMonth[month] || 0,
      totalOrderGrandTotalPerMonth: totalComplaintGrandTotalPerMonth[month] || 0,
      totalCancelComplaint: totalCancelComplaintPerMonth,
      totalApprovedByHO: totalApprovedByHOComplaintPerMonth,
      totalApprovedByVendor: totalApprovedByVendorComplaintPerMonth,
      totalRejectByHo: totalRejectByHOComplaintPerMonth,
      totalRejectByVendor: totalRejectByVendorComplaintPerMonth,
      totalReworkStart: totalReworkStartComplaintPerMonth,
      totalReworkReq: totalReworkReqComplaintPerMonth,
      totalReworkEnd: totalReworkEndComplaintPerMonth,
      complaintMonth: complaintMonth[month] || []
    }));

    return {
      complaint,
      complaintGrandTotal,
      monthlyComplaint
    };
  }

  async reportWorkOrder(query: QueryParamsDto) {
    const {
      status,
      date_from,
      date_to,
      order_by,
      member_id,
      vendor_id
    } = query;
    console.log(status);
    const statuses = await this.dbService.status.findMany();

    const statusWorkReq = statuses.find((i) => i.category.toLocaleLowerCase().includes("workreq"));
    const statusWorkStart = statuses.find((i) => i.category.toLocaleLowerCase().includes("workstart"));
    const statusWIP = statuses.find((i) => i.category.toLocaleLowerCase().includes("wip"));
    const statusWorkEnd = statuses.find((i) => i.category.toLocaleLowerCase().includes("workend"));


    const where: Prisma.work_ordersWhereInput = {
      AND: [
        ...(member_id ? [{
          order: {
            member_id: {
              equals: member_id
            }
          }
        }] : []),
        ...(vendor_id ? [{
          vendor_id: {
            equals: vendor_id
          }
        }] : []),
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
        status: true
      }
    });
    const count = await this.dbService.orders.count();
    const totalWorkOrdersPerMonth = {};
    const ordersMonth = {};
    const totalCompleteOrderPerMonth = {};
    const totalWorkStartWorkOrdersPerMonth = {};
    const totalWIPOrderPerMonth = {};
    const totalWorkEndOrderPerMonth = {};
    const allMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    allMonths.forEach(month => {
      totalWorkStartWorkOrdersPerMonth[month] = 0;
      totalCompleteOrderPerMonth[month] = 0;
      totalWIPOrderPerMonth[month] = 0;
      totalWorkEndOrderPerMonth[month] = 0;
    });

    workOrders.forEach(order => {
      const month = new Date(order.created_at).toLocaleString('id-ID', { month: 'long' });

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
      if (order.status.category === statusWIP.category) {
        totalWIPOrderPerMonth[month]++;
      }
      if (order.status.category === statusWorkEnd.category) {
        totalWorkEndOrderPerMonth[month]++;
      }
    });
    const grandTotalSurveyOrderPerMonth = {};
    allMonths.forEach(month => {
      grandTotalSurveyOrderPerMonth[month] = ordersMonth[month] ? ordersMonth[month].filter(order => order.status.category.includes("survey")).length : 0;
    });

    const monthlyWorkOrders = allMonths.map(month => ({
      month,
      totalOrder: totalWorkOrdersPerMonth[month] || 0,
      totalCompleteOrder: totalCompleteOrderPerMonth[month] || 0,
      totalUnpaidOrder: totalWorkStartWorkOrdersPerMonth[month] || 0,
      totalWIPOrder: totalWIPOrderPerMonth[month] || 0,
      totalWorkEndOrder: totalWorkEndOrderPerMonth[month] || 0,
      totalSurveyOrder: grandTotalSurveyOrderPerMonth[month] || 0,
      workOrdersMonth: ordersMonth[month] || [],

    }));

    return {
      data: workOrders,
      total: count,
      takeTotal: workOrders.length,
      monthlyWorkOrders,
    };
  }

  async reportTukang(query: QueryParamsDto) {
    const tukang = await this.dbService.tukang.findMany({
      include: {
        work_order_tukang: {
          include: {
            work_orders: {
              include: {
                order: {
                  include: {
                    invoice_orders: {
                      include: {
                        invoices: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const tukangInvoiceSummary = await Promise.all(tukang.map(async tukangItem => {

      const totalInvoices = await this.dbService.invoices.aggregate({
        where: {
          invoice_orders: {
            some: {
              orders: {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukangItem.id
                    }
                  }
                }
              }
            }
          }
        },
        _sum: {
          total_quotation_grand_total: true
        }
      });

      const totalQuotations = await this.dbService.quotation.aggregate({
        where: {
          order: {
            work_orders: {
              work_order_tukang: {
                some: {
                  tukang_id: tukangItem.id
                }
              }
            }
          }
        },
        _sum: {
          quotation_grand_total: true
        }
      });

      return {
        tukang: tukangItem,
        totalInvoices: totalInvoices._sum?.total_quotation_grand_total || 0,
        totalQuotations: totalQuotations._sum?.quotation_grand_total || 0
      };
    }));

    return tukangInvoiceSummary;
  }


  async reportVendor(query: QueryParamsDto) {
    const vendors = await this.dbService.vendor.findMany({
      include: {
        orders: {
          include: {
            m_order_details: true
          }
        }
      }
    });

    const vendorsSummary = vendors.map(vendor => {
      const totalOrders = vendor.orders.length;
      const totalGrandTotal = vendor.orders.reduce((acc, order) => {
        return acc + Number(order.grand_total);
      }, 0);

      return {
        vendor,
        totalOrders: totalOrders,
        totalGrandTotal: totalGrandTotal
      };
    });

    return vendorsSummary
  }
}
