import { Injectable } from '@nestjs/common';
import { CreateRemedialDto } from './dto/create-remedial.dto';
import { UpdateRemedialDto } from './dto/update-remedial.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class RemedialsService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    remedial_evidences: Express.Multer.File[],
    createRemedialDto: CreateRemedialDto,
    user: users,
  ) {
    try {
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
        })) ?? undefined;


      const remedial_data: Prisma.remedialsCreateInput = {
        complaints: {
          connect: {
            id: createRemedialDto.complaint_id,
          },
        },
        status: createRemedialDto.remedial_status
          ? {
              connect: {
                id: createRemedialDto.remedial_status,
              },
            }
          : undefined,
        remedial_action: createRemedialDto.remedial_action,
        remedial_pic: createRemedialDto.remedial_pic,
        remedial_pic_positon: createRemedialDto.remedial_pic_position,
        ra_date_start: createRemedialDto.ra_date_start ?  new Date(createRemedialDto.ra_date_start)  : undefined,
        ra_date_end: createRemedialDto.ra_date_end
          ? new Date(createRemedialDto.ra_date_end)
          : undefined,
        remedial_evidences: {
          create: evidences,
        },
        
      };

      const remedial_options: Prisma.remedialsCreateArgs = {
        data: remedial_data,
      };

      const [remedialQuery] = await this.dbService.$transaction([
        this.dbService.remedials.create(remedial_options),
      ]);

      return remedialQuery;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { skip, status, search, take } = query;

      const remedial = await this.dbService.remedials.findMany({
        skip: skip,
        take: take,
        where: {
        remedial_action: {
            contains: search ?? null,
          },
          status: {
            id: {
              in: status,
            },
          },
        },
        include: {
          complaints: true,
          remedial_evidences: true,
        },
      });

      return remedial;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
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
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    remedial_evidences: Express.Multer.File[],
    updateRemedialDto: UpdateRemedialDto,
    user: users,
  ) {
    try {
      const { id: user_id } = user;

      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id: updateRemedialDto.complaint_id,
        },
        include: {
          orders: true,
        },
      });
      const evidences: Array<Prisma.remedial_evidencesCreateManyRemedialsInput> =
        remedial_evidences
          ? remedial_evidences.map((evidence) => ({
              evidence_location: evidence.filename,
              created_by: user_id,
            }))
          : undefined;

      const remedial_data = {
        complaints: {
          connect: {
            id: updateRemedialDto.complaint_id,
          },
        },
        status: updateRemedialDto.remedial_status
          ? {
              connect: {
                id: updateRemedialDto.remedial_status,
              },
            }
          : undefined,
        remedial_action: updateRemedialDto.remedial_action,
        remedial_pic: updateRemedialDto.remedial_pic,
        remedial_pic_positon: updateRemedialDto?.remedial_pic_position,
        ra_date_start: updateRemedialDto.ra_date_start ? new Date(updateRemedialDto.ra_date_start)  : undefined,
        ra_date_end: updateRemedialDto.ra_date_end
          ? new Date(updateRemedialDto.ra_date_end)
          : undefined,
      };

      const remedial_options: Prisma.remedialsUpdateArgs = {
        where: {
          id,
        },
        data: {
          ...remedial_data,
          ...(remedial_evidences
            ? {
                remedial_evidences: {
                  updateMany: {
                    where: {
                      remedial_id: id,
                    },
                    data: evidences,
                  },
                },
              }
            : undefined),
        },
      };

      const [remedial] = await this.dbService.$transaction([
        this.dbService.remedials.update(remedial_options),
      ]);

      return remedial;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  remove(id: number) {
    return `This action removes a #${id} remedial`;
  }
}
