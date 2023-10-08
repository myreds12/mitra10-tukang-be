import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
    const { take, page, search, status, date_from, date_to } = query;
    const skip = page * take - take;

    const where: Prisma.complaintsWhereInput = {
      AND: [
        status ? { complaint_status: { equals: status } } : null,
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
      take,
      skip,
      where,
      include: {
        complaint_channels: true,
        status: true,
        orders: {
          include: {
            members: true,
            sales: true,
            store: true,
            status: true,
            vendor: true,
            tukang: true,
            categories: true,

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
      },
    });

    return complaint;
  }

  async update(
    id: number,
    updateConplainDto: UpdateComplaintDto,
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
    // console.log('1');
    // console.log(
    //   updateConplainDto.complaint_status,
    //   complaints.orders.project_status_id,
    //   updateConplainDto.complaint_status,
    //   Boolean(
    //     updateConplainDto?.complaint_status &&
    //       complaints.orders.project_status_id === 1 &&
    //       updateConplainDto.complaint_status !== 2,
    //   ),
    // );

    // console.log('2');
    // console.log(
    //   updateConplainDto.complaint_status,
    //   complaints.orders.project_status_id,
    //   updateConplainDto.complaint_status,
    //   Boolean(
    //     updateConplainDto?.complaint_status &&
    //       complaints.orders.project_status_id === 2 &&
    //       updateConplainDto.complaint_status != 3,
    //   ),
    // );

    if (
      Boolean(
        updateConplainDto.complaint_status &&
          complaints.orders.project_status_id === 1 &&
          updateConplainDto.complaint_status !== 2,
      )
    ) {
      throw new HttpException('Cannot Change Status', HttpStatus.BAD_REQUEST);
    }

    if (
      Boolean(
        updateConplainDto?.complaint_status &&
          complaints.orders.project_status_id === 2 &&
          updateConplainDto.complaint_status !== 3,
      )
    ) {
      throw new HttpException('Cannot Change Status', HttpStatus.BAD_REQUEST);
    }

    const evidences: Array<Prisma.complaint_evidenceUpdateInput> =
      complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        updated_at: new Date(),
        updated_by: user_id,
      }));

    const orderConn = updateConplainDto.order_id
      ? {
          connect: {
            id: updateConplainDto.order_id,
          },
        }
      : undefined;
    const complaint_channelsConn = updateConplainDto.complaint_channel
      ? {
          connect: {
            id: updateConplainDto.complaint_channel,
          },
        }
      : undefined;

    const complaintData: Prisma.complaintsUpdateInput = Object.fromEntries(
      Object.entries({
        orders: orderConn,
        complaint_channels: complaint_channelsConn,
        description: updateConplainDto.description ?? undefined,
        complaint_date: updateConplainDto.complaint_date
          ? new Date(updateConplainDto.complaint_date)
          : undefined,
        complaint_status: updateConplainDto?.complaint_status,
        updated_by: user_id,
        complaint_evidence: evidences.length
          ? {
              updateMany: {
                where: {
                  complaint_id: id,
                },
                data: evidences,
              },
            }
          : undefined,
      }).filter(([key, value]) => value !== undefined),
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
}
