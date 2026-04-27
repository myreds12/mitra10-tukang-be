/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { UpdateComplaintDto } from "./dto/update-complaint.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { QueryParamsDto } from "src/common/dto/query-params.dto";
import { Prisma, users } from "@prisma/client";
import { OrderService } from "src/order/order.service";
import { Response } from "express";
import * as exceljs from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { NotificationsService } from "src/notifications/notifications.service";
import { moduleTypeNotification } from "src/notifications/dto/notification-module-type.enum";
import { CrmService } from "src/crm/crm.service";
import { Cron } from "@nestjs/schedule";

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    private readonly crmService: CrmService
  ) { }

  async create(
    createComplaintDto: CreateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>
  ) {
    try {
      const { id: user_id } = user;

      const evidences = complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

      // Parallel execution of independent queries
      const [COMPLAINT_STATUS, findOrder] = await Promise.all([
        this.dbService.status.findFirst({
          where: { id: createComplaintDto.complaint_status },
        }),
        this.dbService.orders.findFirst({
          where: { id: createComplaintDto.order_id },
        }),
      ]);

      if (!findOrder) throw new BadRequestException("Order does not exist!");

      const complaintData = {
        orders: { connect: { id: createComplaintDto.order_id } },
        complaint_channels: { connect: { id: createComplaintDto.complaint_channel } },
        status: { connect: { id: COMPLAINT_STATUS.id } },
        description: createComplaintDto.description,
        crm_type: createComplaintDto.crm_type,
        pic_name: createComplaintDto.pic_name,
        feedback_name: createComplaintDto.feedback_name,
        feedback_role: createComplaintDto.feedback_role,
        complaint_received_date: createComplaintDto.complaint_received_date ? new Date(createComplaintDto.complaint_received_date) : undefined,
        complaint_date: new Date(createComplaintDto.complaint_date),
        type: createComplaintDto.type,
        created_by: user_id,
        complaint_histories: {
          create: {
            status_id: COMPLAINT_STATUS.id,
            reason: createComplaintDto?.complaint_histories?.reason ?? "",
            created_by: user_id,
            complaint_evidence: { createMany: { data: evidences } },
          },
        },
      };

      const complaint = await this.dbService.complaints.create({
        data: complaintData,
        include: {
          orders: {
            include: {
              work_orders: {
                include: { work_order_tukang: true },
              },
            },
          },
        },
      });

      // Execute notifications and status updates in parallel
      await Promise.all([
        this.notifService.create(
          {
            complaint: complaint,
            orders: complaint.orders,
          },
          "CREATE",
          complaint.created_by,
          moduleTypeNotification.COMPLAINT,
          complaint.id,
          complaint.complaint_status
        ),
        //2026042019 dayat di up kembali
        this.crmService.syncAnswer(complaint.id),
        this.orderService.setStatus(complaint.order_id, complaint.complaint_status, user),
      ]);

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async resync(id: number) {
      return await this.crmService.syncAnswer(id);
  }

  @Cron("0 0 10,23 * * *")
  async syncUnsyncedComplaints() {
    const complaints = await this.dbService.complaints.findMany({
      where: {
        is_sync: 0,
      },
      select: {
        id: true,
      },
    });

    for (const complaint of complaints) {
      try {
        await this.crmService.syncAnswer(complaint.id);
      } catch (error) {
        console.error(`Failed to sync complaint ${complaint.id}`, error);
      }
    }
  }


  async findAll(query: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        tukang_id,
        store_id,
        vendor_id,
      } = query;
      const skip = page * take - take;

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
              work_orders: {
                include: {
                  status: true,
                  work_order_status: {
                    orderBy: {
                      created_at: "desc",
                    },
                    include: {
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      const total = await this.dbService.complaints.count({
        where,
      });
      const complaintGrandTotal = await this.dbService.complaints
        .findMany({
          include: {
            orders: true,
          },
        })
        .then((data) =>
          data.reduce((acc, curr) => acc + Number(curr.orders.grand_total), 0)
        );
      const totalComplaintPerMonth = {};
      const totalComplaintGrandTotalPerMonth = {};
      const allMonths = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
      ];

      allMonths.forEach((month) => {
        totalComplaintGrandTotalPerMonth[month] = 0;
      });

      complaint.forEach((complaint) => {
        const month = new Date(complaint.created_at).toLocaleString("id-ID", {
          month: "long",
        });
        const grandTotalPerMonth = Number(complaint.orders.grand_total);

        if (!totalComplaintPerMonth[month]) {
          totalComplaintPerMonth[month] = 0;
        }

        totalComplaintPerMonth[month]++;
        totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
      });

      const monthlyComplaint = allMonths.map((month) => ({
        month,
        totalOrder: totalComplaintPerMonth[month] || 0,
        totalOrderGrandTotalPerMonth:
          totalComplaintGrandTotalPerMonth[month] || 0,
      }));

      return {
        data: complaint,
        meta: {
          total,
          page,
          take,
          skip,
          complaintGrandTotal,
          monthlyComplaint,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          complaint_channels: true,

          complaint_histories: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc'
            },
            include: {
              status: true,
              complaint_evidence: true,
            },
          },
          remedials: {
            include: {
              remedial_evidences: true,
              status: true,
            },
          },
          status: true,
          orders: {
            include: {
              members: true,
              sales: true,
              status: true,
              vendor: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
                select: {
                  id: true,
                  company_name: true,
                  address: true,
                  phone_number: true,
                  is_active: true,
                  work_orders: {
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
              },
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
                  item_notes: true,
                  unit_price: true,
                  quantity: true,
                  total: true,
                  comission: true,
                  created_by: true,
                  created_at: true,
                },
              },
              order_files: {
                where: {
                  deleted_at: null,
                },
              },
              quotation: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
                orderBy: {
                  created_at: "desc",
                },
                include: {
                  promotion: true,
                  quotation_details: {
                    where: {
                      deleted_at: null,
                    },
                  },
                  quotation_files: true,
                },
              },
              work_orders: {
                include: {
                  request_tukang: {
                    include: {
                      tukang_to_request_tukang: true,
                      tukang_to_replace_tukang: true,
                    },
                  },
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
                      created_at: "desc",
                    },
                  },
                },
              },
              order_history: {
                select: {
                  order_id: true,
                  payload: true,
                  created_at: true,
                  status: {
                    select: {
                      id: true,
                      category: true,
                      description: true,
                    },
                  },
                },
              },
              invoice_details: true,
            },
          },
        },
      });

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateComplaintDto: UpdateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>
  ) {
    try {
      const { id: user_id } = user;
      const complaints = await this.dbService.complaints.findFirst({
        where: { id },
      });

      const status = await this.dbService.status.findMany();

      if (!complaints) throw new NotFoundException("Complaint Not Found!");

      await this.dbService.complaint_evidence.updateMany({
        where: {
          complaint_history_id:
            updateComplaintDto?.complaint_histories?.id ?? 0,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      // ✅ Perbaikan: cek apakah ada file sebelum map
      const hasEvidences = complaint_evidences && complaint_evidences.length > 0;
      const evidences = hasEvidences
        ? complaint_evidences.map((file) => ({
          evidence_location: file.filename,
          created_by: user_id,
        }))
        : [];

      const orderConn = updateComplaintDto.order_id
        ? { connect: { id: updateComplaintDto.order_id } }
        : undefined;

      const surveyStatusCategories = ["SURVEYREQ", "SURVEYSTART", "SURVEYEND"];
      const workStatusCategories = ["WORKREQ", "WORKSTART", "WORKEND"];

      const orders = await this.dbService.orders.findFirst({
        where: {
          id: updateComplaintDto?.order_id ?? complaints.order_id,
        },
        include: {
          status: true,
          order_history: {
            where: {
              status: {
                category: {
                  in: [...surveyStatusCategories, ...workStatusCategories],
                },
              },
              deleted_at: null,
            },
            include: { status: true },
            orderBy: { created_at: "desc" },
            take: 10,
          },
        },
      });

      let statusOrderUpdate;

      const complaintApprovedByHoStatus = status.find((x) =>
        x.category.toLocaleLowerCase().includes("complaintapprovedbyho")
      )?.id;
      const complaintRejectedByHoStatus = status.find((x) =>
        x.category.toLocaleLowerCase().includes("rejectedbyho")
      )?.id;

      // ✅ Perbaikan: guard jika order_history kosong
      if (orders?.order_history?.length > 0) {
        if (
          complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
          surveyStatusCategories.includes(orders.order_history[0].status.category)
        ) {
          statusOrderUpdate = status.find((x) =>
            x.category.toLowerCase().includes("resurveyreq")
          )?.id;
        } else if (
          complaintApprovedByHoStatus === updateComplaintDto.complaint_status &&
          workStatusCategories.includes(orders.order_history[0].status.category)
        ) {
          statusOrderUpdate = updateComplaintDto.work_status_update;
        } else if (
          complaintRejectedByHoStatus === updateComplaintDto.complaint_status
        ) {
          statusOrderUpdate = orders.order_history[0].status.id;
        }
      }

      const complaint_channelsConn = updateComplaintDto.complaint_channel
        ? { connect: { id: updateComplaintDto.complaint_channel } }
        : undefined;

      // ✅ Perbaikan: filter yang benar [key, value] bukan [value]
      const complaintData: Prisma.complaintsUpdateInput = Object.fromEntries(
        Object.entries({
          orders: orderConn,
          complaint_channels: complaint_channelsConn,
          pic_name: updateComplaintDto.pic_name,
          description: updateComplaintDto.description ?? undefined,
          ...(updateComplaintDto.complaint_received_date
            ? {
              complaint_received_date: new Date(
                updateComplaintDto.complaint_received_date
              ),
            }
            : undefined),
          complaint_date: updateComplaintDto.complaint_date
            ? new Date(updateComplaintDto.complaint_date)
            : undefined,
          updated_by: user_id,
          complaint_histories: {
            create: {
              status_id: complaints.complaint_status,
              reason: updateComplaintDto?.complaint_histories?.reason ?? undefined,
              created_by: user_id,
              // ✅ Perbaikan: gunakan hasEvidences
              complaint_evidence: hasEvidences
                ? { createMany: { data: evidences } }
                : undefined,
            },
          },
          // ✅ Perbaikan: destructuring yang benar
        }).filter(([key, value]) => value !== undefined)
      );

      const [complaint] = await this.dbService.$transaction([
        this.dbService.complaints.update({
          where: { id },
          data: {
            ...complaintData,
            ...(updateComplaintDto.complaint_status
              ? {
                status: {
                  connect: {
                    id: updateComplaintDto?.complaint_status,
                  },
                },
              }
              : undefined),
          },
          include: {
            orders: {
              include: {
                work_orders: {
                  include: {
                    work_order_tukang: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      if (complaint) {
        await this.notifService.create(
          { complaint, orders: complaint.orders },
          "UPDATE",
          complaint.updated_by,
          moduleTypeNotification.COMPLAINT,
          complaint.id,
          complaint.complaint_status
        );
      }

      if (
        statusOrderUpdate &&
        complaintApprovedByHoStatus === updateComplaintDto.complaint_status
      ) {
        try {
          await this.dbService.work_orders.update({
            where: { order_id: updateComplaintDto.order_id },
            data: {
              status_id: statusOrderUpdate,
              work_order_status: {
                create: {
                  status_id: statusOrderUpdate,
                  created_at: new Date(),
                },
              },
            },
          });
          await this.orderService.setStatus(
            complaint.order_id,
            statusOrderUpdate,
            user
          );
        } catch (error) {
          throw new BadRequestException("No Work Orders To Update");
        }
      } else if (
        complaintRejectedByHoStatus === updateComplaintDto.complaint_status
      ) {
        await this.orderService.setStatus(
          complaint.order_id,
          statusOrderUpdate,
          user
        );
      }

      return complaint;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.complaints.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getCode() {
    try {
      const complaints = await this.dbService.complaints.findMany({
        orderBy: {
          id: "desc",
        },
        take: 1,
      });

      return complaints[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async setStatus(id: number, status_id: number, payload: { reason?: string }) {
    try {
      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id,
        },
        include: {
          status: true,
        },
      });

      if (
        !["DRAFTED", "INVESTIGATE", "INVESTIGATED"].includes(
          complaint.status.category
        )
      )
        throw new BadRequestException("Cannot Change Status");

      const data = await this.dbService.complaints.update({
        where: {
          id,
        },
        data: {
          status: {
            connect: {
              id: status_id,
            },
          },
        },
      });

      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async complaintExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet("Data Keluhan", {
        properties: {
          tabColor: { argb: "FF00FF00" },
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
        { header: "Compaint ID", key: "id", width: 10 },
        { header: "Order ID", key: "order_id", width: 10 },
        { header: "Complaint Melalui", key: "complaint_channel", width: 20 },
        { header: "Deskripsi", key: "description", width: 40 },
        { header: "Tanggal Complaint", key: "complaint_date", width: 25 },
        { header: "Nama Toko", key: "store_name", width: 30 },
        { header: "Nama Konsumen", key: "member_name", width: 30 },
        { header: "Nama Telepon Konsumen", key: "phone_number", width: 30 },
        { header: "Tanggal Order", key: "order_create", width: 30 },
        { header: "Umur Complaint", key: "complaint_age", width: 20 },
        { header: "Status Order", key: "order_status", width: 30 },
        { header: "Status Pengerjaan", key: "work_status", width: 30 },
        { header: "Status Complaint", key: "complaint_status", width: 30 },
        { header: "Feedback Name", key: "feedback_name", width: 25 },
        { header: "Feedback Role", key: "feedback_role", width: 25 },
        { header: "Complaint Dibuat", key: "created_at", width: 25 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "0000FF" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      data.forEach((complaint) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}, ${dateTime.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          })}`;

        function calculateComplaintAge(complaintCreatedAt) {
          const complaintCreatedAtDate = new Date(complaintCreatedAt);
          if (isNaN(complaintCreatedAtDate.getTime())) {
            throw new Error("Invalid date for complaintCreatedAt");
          }

          const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;
          const complaintCreatedAtWith7Days = new Date(
            complaintCreatedAtDate.getTime() + sevenDaysInMillis
          );

          const now = new Date();

          const timeDiff =
            complaintCreatedAtWith7Days.getTime() - now.getTime();

          // console.log(timeDiff);
          // console.log(complaintCreatedAtWith7Days);
          const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
          const hours = Math.floor(
            (timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
          );

          return `${days} hari, ${hours} jam`;
        }

        const complaintAge = calculateComplaintAge(complaint.created_at);

        const row = worksheet.addRow({
          id: complaint.id,
          order_id: complaint.order_id,
          complaint_channel: complaint.complaint_channels
            ? complaint.complaint_channels.name
            : "N/a",
          description: complaint.description,
          complaint_date: formattedDateTime(complaint.complaint_date),
          store_name: complaint.orders.store.store_name,
          member_name: complaint.orders.members.full_name,
          phone_number:
            complaint?.orders?.members?.whatsapp_number ??
            complaint?.orders?.members?.whatsapp_number,
          order_create: formattedDateTime(complaint.orders.created_at),
          complaint_age: complaintAge,
          order_status: complaint.orders.status.description,
          work_status:
            complaint.orders?.work_orders?.status?.description || "-",
          complaint_status: complaint?.status?.description || "",
          feedback_name: complaint.feedback_name
            ? complaint.feedback_name
            : "-",
          feedback_role: complaint.feedback_role
            ? complaint.feedback_role
            : "-",
          created_at: formattedDateTime(complaint.created_at),
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, "0");
        const tanggal = String(now.getDate()).padStart(2, "0");
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = "./storage/excel/complaint";
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
        res: Response
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${path.basename(excelFilePath)}`
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataKomplain-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }
}
