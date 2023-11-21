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
import { Prisma, complaints } from '@prisma/client';
import { OrderService } from 'src/order/order.service';

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
  ) {}
  async create(
    createComplaintDto: CreateComplaintDto,
    user_id: number,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    console.log('createComplaintDto', createComplaintDto);

    const evidences: Array<Prisma.complaint_evidenceCreateManyComplaintsInput> =
      complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

    const COMPLAINT_STATUS = await this.dbService.status.findFirst({
      where: {
        category: {
          equals: 'investigate',
        },
      },
    });

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
      // status: COMPLAINT_STATUS.id,
      // complaint_status: COMPLAINT_STATUS.id,
      created_by: user_id,
      complaint_evidence: {
        createMany: { data: evidences },
      },
    };

    const [complaint] = await this.dbService.$transaction([
      this.dbService.complaints.create({
        data: complaintData,
      }),
    ]);

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

    const complaint: complaints[] = await this.dbService.complaints.findMany({
      take: take <= 0 ? undefined : take,
      skip,
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        complaint_channels: true,
        complaint_evidence: true,
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

    return complaint;
  }

  async findOne(id: number) {
    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id,
      },
      include: {
        complaint_channels: true,
        complaint_evidence: true,
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

    return complaint;
  }

  async update(
    id: number,
    updateComplaintDto: UpdateComplaintDto,
    user_id: number,
    complaint_evidences: Array<Express.Multer.File>,
  ) {
    const complaints = await this.dbService.complaints.findFirst({
      where: {
        id,
      },
      include: {
        orders: true,
      },
    });

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

    await this.dbService.complaint_evidence.deleteMany({
      where: {
        complaint_id: id,
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
        complaint_evidence: evidences.length
          ? {
              createMany: {
                data: evidences,
              },
            }
          : undefined,
      }).filter(([key, value]) => value !== undefined),
    );
    console.log('complaintData', complaintData);

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

  async setStatus(id: number, status_id: number) {
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
