import { Injectable } from '@nestjs/common';
import { CreateRemedialDto } from './dto/create-remedial.dto';
import { UpdateRemedialDto } from './dto/update-remedial.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class RemedialsService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    remedial_evidences: Express.Multer.File[],
    createRemedialDto: CreateRemedialDto,
    user: users,
  ) {
    const { id: user_id } = user;

    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id: createRemedialDto.complaint_id,
      },
      include: {
        orders: true,
      },
    });

    const evidences: Array<Prisma.remedial_evidencesCreateManyRemedialsInput> =
      remedial_evidences.map((evidence) => ({
        evidence_location: evidence.filename,
        created_by: user_id,
      }));

    console.log(evidences, remedial_evidences);

    const remedial_data = {
      complaints: {
        connect: {
          id: createRemedialDto.complaint_id,
        },
      },
      status: createRemedialDto.remedial_status ? {
        connect: {
          id: createRemedialDto.remedial_status
        }
      } : undefined,
      remedial_action: createRemedialDto.remedial_action,
      remedial_pic: createRemedialDto.remedial_pic,
      ra_date_start: new Date(createRemedialDto.ra_date_start),
      ra_date_end: new Date(createRemedialDto.ra_date_end),
    };

    const remedial_options: Prisma.remedialsCreateArgs = {
      data: {
        ...remedial_data,
        remedial_evidences: {
          createMany: {
            data: evidences,
          },
        },
      },
    };

    const [remedialQuery] = await this.dbService.$transaction([
      this.dbService.remedials.create(remedial_options),
    ]);

    return {
      ...remedialQuery,
    };

    // if (
    //   complaint.complaint_status == 1 /* FILL WITH STATUS ACCEPTED*/ &&
    //   complaint.orders.project_status_id == 3 /* FILL WITH STATUS ACCEPTED*/
    // ) {
    // } else {
    //   return {
    //     message: 'Please Fill Complaint Id With Status Accepted',
    //   };
    // }
  }

  async findAll(query: QueryParamsDto) {
    const { skip, status, search, take } = query;

    const remedial = await this.dbService.remedials.findMany({
      skip: skip,
      take: take,
      where: {
        remedial_action: {
          contains: search ?? null,
        },
        remedial_status: {
          equals: status,
        },
      },
      include: {
        complaints: true,
        remedial_evidences: true,
      },
    });

    return remedial;
  }

  async findOne(id: number) {
    const remedial = await this.dbService.remedials.findFirst({
      where: {
        id,
      },
      include: {
        remedial_evidences: true,
        complaints: true,
      },
    });

    return remedial;
  }

  async update(
    id: number,
    remedial_evidences: Express.Multer.File[],
    updateRemedialDto: UpdateRemedialDto,
    user: users,
  ) {
    const { id: user_id } = user;

    const complaint = await this.dbService.complaints.findFirst({
      where: {
        id: updateRemedialDto.complaint_id,
      },
      include: {
        orders: true,
      },
    });

    if (
      complaint.complaint_status == 1 /* FILL WITH STATUS ACCEPTED*/ &&
      complaint.orders.project_status_id == 3 /* FILL WITH STATUS ACCEPTED*/
    ) {
      const evidences: Array<Prisma.remedial_evidencesCreateManyRemedialsInput> =
        remedial_evidences.map((evidence) => ({
          evidence_location: evidence.filename,
          created_by: user_id,
        }));

      const remedial_data = {
        complaints: {
          connect: {
            id: updateRemedialDto.complaint_id,
          },
        },
        status: updateRemedialDto.remedial_status ? {
          connect: {
            id: updateRemedialDto.remedial_status
          }
        } : undefined,
        remedial_action: updateRemedialDto.remedial_action,
        remedial_pic: updateRemedialDto.remedial_pic,
        ra_date_start: new Date(updateRemedialDto.ra_date_start),
        ra_date_end: new Date(updateRemedialDto.ra_date_end),
      };

      const remedial_options: Prisma.remedialsUpdateArgs = {
        where: {
          id,
        },
        data: {
          ...remedial_data,
          remedial_evidences: {
            updateMany: {
              where: {
                remedial_id: id,
              },
              data: evidences,
            },
          },
        },
      };

      const [{ id: remedial_id }] = await this.dbService.$transaction([
        this.dbService.remedials.update(remedial_options),
      ]);

      return {
        id: remedial_id,
        ...remedial_data,
      };
    } else {
      return {
        message: 'Please Fill Complaint Id With Status Accepted',
      };
    }
  }

  remove(id: number) {
    return `This action removes a #${id} remedial`;
  }
}
