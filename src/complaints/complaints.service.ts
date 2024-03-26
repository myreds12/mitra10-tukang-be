import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, complaints, users } from '@prisma/client';
import { OrderService } from 'src/order/order.service';

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
  ) { }
  async create(
    createComplaintDto: CreateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;
    console.log('createComplaintDto', createComplaintDto);

    const evidences: Array<Prisma.complaint_evidenceCreateManyComplaint_historiesInput> =
      complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

    const COMPLAINT_STATUS = await this.dbService.status.findFirst({
      where: {
        id: createComplaintDto.complaint_status,
      },
    });

    if (!COMPLAINT_STATUS.category.includes('INVESTIGATED' || 'WARRANTYCLAIM'))
      throw new BadRequestException('Status does not exist!');

    const findOrder = await this.dbService.orders.findFirst({
      where: {
        id: createComplaintDto.order_id,
      },
    });
    const status = await this.dbService.status.findMany();

    const statusDone = status.find((i) => i.category.toLocaleLowerCase().includes('done'));

    if (!findOrder) throw new BadRequestException('Order does not exist!');
    let now = new Date();
    now.setDate(now.getDate() + 7);

    if (createComplaintDto.type === 2 && findOrder.created_at < now && findOrder.project_status_id !== statusDone.id)
      throw new BadRequestException('You cannot claim this order!'); //FIXME: FIX THE MESSAGE

    const complaintData: Prisma.complaintsCreateInput = {
      orders: {
        connect: {
          id: createComplaintDto.order_id,
        },
      },
      complaint_channels: {
        connect: {
          id: createComplaintDto.complaint_channel,
        },
      },
      status: {
        connect: {
          id: COMPLAINT_STATUS.id,
        },
      },
      description: createComplaintDto.description,
      complaint_date: new Date(createComplaintDto.complaint_date),
      type: createComplaintDto.type,
      // status: COMPLAINT_STATUS.id,
      // complaint_status: COMPLAINT_STATUS.id,
      created_by: user_id,
      complaint_histories: {
        create: {
          status_id: COMPLAINT_STATUS.id,
          reason: createComplaintDto?.complaint_histories?.reason ?? "",
          created_by: user_id,
          complaint_evidence: {
            createMany: { data: evidences },
          },
        },
      },
    };

    
    const [complaint] = await this.dbService.$transaction([
      this.dbService.complaints.create({
        data: complaintData,
      }),
    ]);

    await this.orderService.setStatus(
     complaint.order_id,
     complaint.complaint_status,
     user,
   );

    return complaint;
  }

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } = query;
    const skip = page * take - take;

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
    const total = await this.dbService.complaints.count({
      where
    })
    const complaintGrandTotal = await this.dbService.complaints.findMany({
      include: {
        orders: true,
      }
    }).then((data) => data.reduce((acc, curr) => acc + Number(curr.orders.grand_total), 0));
    const totalComplaintPerMonth = {};
    const totalComplaintGrandTotalPerMonth = {};
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

      totalComplaintPerMonth[month]++;
      totalComplaintGrandTotalPerMonth[month] += grandTotalPerMonth;
    });

    const monthlyComplaint = allMonths.map(month => ({
      month,
      totalOrder: totalComplaintPerMonth[month] || 0,
      totalOrderGrandTotalPerMonth: totalComplaintGrandTotalPerMonth[month] || 0
    }));

    return {
      complaint,
      total,
      page,
      take,
      skip,
      complaintGrandTotal,
      monthlyComplaint
    };
  }

  async findOne(id: number) {
    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id,
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
            m_order_details: {
              include: {
                item: true,
              },
            },
          },
        },
      },
    });

    return complaint;
  }

  async update(
    id: number,
    updateComplaintDto: UpdateComplaintDto,
    user: users,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    const { id: user_id } = user;
    const complaints = await this.dbService.complaints.findFirst({
      where: {
        id,
      },
    });

    if (!complaints)
      throw new HttpException('Complaint Not Found!', HttpStatus.NOT_FOUND);

    console.log('updateComplaintDto', updateComplaintDto);

    // if (
    //   Boolean(
    //     updateComplaintDto.complaint_status &&
    //       complaints.orders.project_status_id === 1 &&
    //       updateComplaintDto.complaint_status !== 2,
    //   )
    // ) {
    //   throw new HttpException('Cannot Change Status', HttpStatus.BAD_REQUEST);
    // }

    // if (
    //   Boolean(
    //     updateComplaintDto?.complaint_status &&
    //       complaints.orders.project_status_id === 2 &&
    //       updateComplaintDto.complaint_status !== 3,
    //   )
    // ) {
    //   throw new HttpException('Cannot Change Status', HttpStatus.BAD_REQUEST);
    // }

    await this.dbService.complaint_evidence.updateMany({
      where: {
        complaint_history_id:
          updateComplaintDto.complaint_histories.id ?? 0,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });

    const evidences = complaint_evidences.map((file) => ({
      evidence_location: file.filename,
      created_by: user_id,
    }));

    const orderConn = updateComplaintDto.order_id
      ? {
        connect: {
          id: updateComplaintDto.order_id,
        },
      }
      : undefined;
    const complaint_channelsConn = updateComplaintDto.complaint_channel
      ? {
        connect: {
          id: updateComplaintDto.complaint_channel,
        },
      }
      : undefined;

    const complaintData: Prisma.complaintsUpdateInput = Object.fromEntries(
      Object.entries({
        orders: orderConn,
        complaint_channels: complaint_channelsConn,
        description: updateComplaintDto.description ?? undefined,
        complaint_date: updateComplaintDto.complaint_date
          ? new Date(updateComplaintDto.complaint_date)
          : undefined,
        complaint_status: updateComplaintDto?.complaint_status,
        updated_by: user_id,
        complaint_histories: {
          create: {
            status_id: complaints.complaint_status,
            reason: updateComplaintDto?.complaint_histories.reason ?? undefined,
            created_by: user_id,
            complaint_evidence: evidences.length
              ? {
                createMany: {
                  data: evidences,
                },
              }
              : undefined,
          },
        },
      }).filter(([key, value]) => value !== undefined),
    );
    console.log('complaintData', complaintData);
    this.orderService.setStatus(
      updateComplaintDto?.order_id,
      updateComplaintDto?.complaint_status,
      user,
    );

    const [complaint] = await this.dbService.$transaction([
      this.dbService.complaints.update({
        where: {
          id: id,
        },
        data: complaintData,
      }),
    ]);

    return complaint;
  }

  async remove(id: number, user_id: number) {
    await this.dbService.complaints.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });
  }

  async getCode() {
    const complaints = await this.dbService.complaints.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return complaints[0] || null;
  }

  async setStatus(id: number, status_id: number, payload: { reason?: string }) {
    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id,
      },
      include: {
        status: true,
      },
    });

    if (
      !['DRAFTED', 'INVESTIGATE', 'INVESTIGATED'].includes(
        complaint.status.category,
      )
    )
      throw new BadRequestException('Cannot Change Status');

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
  }
}
