import { Injectable } from '@nestjs/common';
import { CreateComplaintEvidenceDto } from './dto/create-complaint-evidence.dto';
import { UpdateComplaintEvidenceDto } from './dto/update-complaint-evidence.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ComplaintEvidenceService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createComplaintEvidenceDto: CreateComplaintEvidenceDto, user_id: number, complaint_file: Express.Multer.File) {
    let filePath = null;
    if (complaint_file) {
      filePath = complaint_file.filename;
    }

    const data = await this.dbService.complaint_evidence.create({
      data: {
        complaints: {
          connect: {
            id: Number(createComplaintEvidenceDto.complaint_id)
          }
        },
        evidance_location: filePath ?? '',
        created_by: user_id
      }
    })

    return data;
  }

  async findAll() {
    const data = await this.dbService.complaint_evidence.findMany()

    return data
  }

  async findOne(id: number) {
    const data = await this.dbService.complaint_evidence.findFirst({
      where: {
        id
      }
    })

    return data
  }

  async update(id: number, updateComplaintEvidenceDto: UpdateComplaintEvidenceDto, complaint_file: Express.Multer.File, user_id: number) {
    let filePath = null;
    if (complaint_file) {
      filePath = complaint_file.filename;
    }

    const data = await this.dbService.complaint_evidence.update({
      where: {
        id
      },
      data: {
        complaints: {
          connect: {
            id: Number(updateComplaintEvidenceDto.complaint_id)
          }
        },
        evidance_location: filePath ?? '',
        updated_at: new Date(),
        updated_by: user_id
      }
    })

    return data
  }

  async remove(id: number, user_id: number) {
    const data = await this.dbService.complaint_evidence.update({
      where: {
        id
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id
      }
    })
    return data
  }
}
