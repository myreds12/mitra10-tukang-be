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

@Injectable()
export class ReportsService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
    private readonly httpService : HttpService
  ) {}
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

  async createForm(dto: FormDto){
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

    const response = await this.httpService.post(url, request, {headers})

    return response
  }

  async reportOrder(query: QueryParamsDto){
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
      invoice_status
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
        ...(status ? [{ status: { id: { in: status } } }] : []),
        ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
        store_id
          ? {
            store_id: {
              in: store_id,
            },
          } : undefined,
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
            city_id: true,
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
            city_id: true,
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
    const { take, page, search, status, date_from, date_to, order_by } = queryParamsDto;
    const skip = page * take - take;

    const statuses = await this.dbService.status.findMany();

    const statusCancel = statuses.find((i) => i.category.toLocaleLowerCase().includes("cancel"))
    const where: Prisma.complaintsWhereInput = {
      AND: [
        status ? { status: { id: { in: status } } } : null,
        search ? { complaint_channels: { name: { contains: search } } } : null,
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
    const complaintMonth = {} ;
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

      if(complaint.status.category === statusCancel.category){
        totalCancelComplaintPerMonth[month]++;
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
      complaintMonth: complaintMonth[month] || []
    }));

    return {
      complaint,
      complaintGrandTotal,
      monthlyComplaint
    };
  }

}
