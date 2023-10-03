import { Injectable } from '@nestjs/common';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, complaints } from '@prisma/client';

@Injectable()
export class ComplaintsService {
  constructor(private readonly dbService: PrismaService) {}
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
      description: createComplaintDto.description,
      complaint_date: new Date(createComplaintDto.complaint_date),
      complaint_status: createComplaintDto.complaint_status,
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
        status ? { complaint_status: { equals: Number(status) } } : null,
        search ? { complaint_channels: { name: { equals: search } } } : null,
        date_from && date_to
          ? {
              complaint_date: {
                gte: new Date(date_from),
                lte: new Date(date_to),
              },
            }
          : null,
      ].filter((condition) => condition !== null),
    };
    console.log(where);

    const complaint: complaints[] = await this.dbService.complaints.findMany({
      take,
      skip,
      where,
    });

    return complaint;
  }

  async findOne(id: number) {
    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id,
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
    const evidences: Array<Prisma.complaint_evidenceUpdateInput> =
      complaint_evidences.map((file) => ({
        evidence_location: file.filename,
        created_by: user_id,
      }));

    const complaintData: Prisma.complaintsUpdateInput = {
      orders: {
        connect: {
          id: updateConplainDto.order_id,
        },
      },
      complaint_channels: {
        connect: {
          id: updateConplainDto.complaint_channel,
        },
      },
      description: updateConplainDto.description,
      complaint_date: new Date(updateConplainDto.complaint_date),
      complaint_status: updateConplainDto.complaint_status,
      created_by: user_id,

      complaint_evidence: {
        updateMany: {
          where: {
            complaint_id: id,
          },
          data: evidences,
        },
      },
    };

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
