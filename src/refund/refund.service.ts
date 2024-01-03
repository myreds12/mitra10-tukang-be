import { Injectable } from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto';
import { UpdateRefundDto } from './dto/update-refund.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { refund_evidences } from '@prisma/client';

@Injectable()
export class RefundService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createRefundDto: CreateRefundDto,
    user: users,
    refunds_evidences: Express.Multer.File[],
  ) {
    const { id: user_id } = user;

    const evidences:
      | Array<Prisma.refund_evidencesCreateManyRefundInput>
      | undefined =
      refunds_evidences?.map((evidence) => ({
        evidence_location: evidence.filename,
        created_by: user_id,
      })) ?? undefined;

    const RefundData: Prisma.refundCreateInput = {
      refund_evidences: {
        create: evidences,
      },
      orders: {
        connect: {
          id: createRefundDto.order_id,
        },
      },
      status: {
        connect: {
          id: createRefundDto.refund_status,
        },
      },
      date_approve: createRefundDto.date_approve
        ? new Date(createRefundDto.date_approve)
        : new Date(),
      date_of_filing: new Date(createRefundDto.date_of_filing),
      notes: createRefundDto.notes,
      reason: createRefundDto.reason,
      approval_number: createRefundDto.approval_number,
      penalty_nominal: createRefundDto.penalty_nominal
        ? createRefundDto.penalty_nominal
        : null,
      voucher: createRefundDto.voucher ? createRefundDto.voucher : null,
      created_by: user_id,
    };

    const refund = await this.dbService.refund.create({
      data: RefundData,
    });

    return refund;
  }

  async findAll(query: QueryParamsDto) {
    const { order_by, date_from, date_to, page, search, status, take } = query;
    const skip = page * take - take;
    const where: Prisma.refundWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { voucher: { contains: search } },
                  { reason: { contains: search } },
                ],
              },
            ]
          : []),
        ...(status ? [{ status: { id: { in: status } } }] : []),
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

    const refund = await this.dbService.refund.findMany({
      skip,
      take: take > 0 ? take : undefined,
      where,
      orderBy: {
        created_at: order_by,
      },
      include: {
        orders: {
          include: {
            members: true,
            store: true,
            m_order_details: {
              include: {
                item: true,
              },
            },
            sales: true,
            status: true,
          },
        },
        status: true,
      },
    });

    return { data: refund, total: refund.length, skip, take, page };
  }

  async findOne(id: number) {
    const refund = await this.dbService.refund.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        orders: {
          include: {
            members: true,
            store: true,
            m_order_details: {
              include: {
                item: true,
              },
            },
            sales: true,
            status: true,
          },
        },
        status: true,
      },
    });

    return refund;
  }

  async update(
    id: number,
    updateRefundDto: UpdateRefundDto,
    user: users,
    refunds_evidences: Express.Multer.File[],
  ) {
    const { id: user_id } = user;

    const evidences: Array<Prisma.refund_evidencesCreateManyRefundInput> =
      refunds_evidences
        ? refunds_evidences.map((evidence) => ({
            evidence_location: evidence.filename,
            created_by: user_id,
          }))
        : undefined;

    const refundConn = {
      orders: {
        connect: {
          id: updateRefundDto.order_id,
        },
      },
      status: {
        connect: {
          id: updateRefundDto.refund_status,
        },
      },
    };
    const refundData = {
      date_approve: new Date(updateRefundDto.date_approve),
      date_of_filing: new Date(updateRefundDto.date_of_filing),
      approval_number: updateRefundDto.approval_number,
      notes: updateRefundDto.notes,
      reason: updateRefundDto.reason,
      penalty_nominal: updateRefundDto.penalty_nominal
        ? updateRefundDto.penalty_nominal
        : null,
      voucher: updateRefundDto.voucher ? updateRefundDto.voucher : null,
      created_by: user_id,
    };
    const refund = await this.dbService.refund.update({
      where: {
        id,
      },
      data: {
        ...refundConn,
        ...refundData,
      },
    });

    return refund;
  }

  async remove(id: number) {
    return `This action removes a #${id} refund`;
  }
}
