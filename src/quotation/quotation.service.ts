import { Injectable } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class QuotationService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createQuotationDto: CreateQuotationDto, user_id: number) {
    const quotation = await this.dbService.quotation.create({
      data: {
        complaint_status: createQuotationDto.complaint_status,
        description: createQuotationDto.description,
        quotation_date: new Date(createQuotationDto.quotation_date),
        quotation_number: createQuotationDto.quotation_number,
        quotation_validity: new Date(createQuotationDto.quotation_validity),
        created_by: user_id
      }
    })

    return quotation
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { take: limit, skip, search, status } = queryParamsDto
    const quotation = await this.dbService.quotation.findMany({
      where: {
        description: {
          contains: search
        },
        quotation_number: {
          contains: search
        }
      }
    })

    return quotation;
  }

  async findOne(id: number) {
    const quotation = await this.dbService.quotation.findFirst({
      where: {
        id
      }
    })

    return quotation
  }

  async update(id: number, updateQuotationDto: UpdateQuotationDto, user_id: number) {
    const quotation = await this.dbService.quotation.update({
      where: {
        id
      },
      data: {
        description: updateQuotationDto.description,
        complaint_status: updateQuotationDto.complaint_status,
        quotation_date: new Date(updateQuotationDto.quotation_date),
        quotation_validity: new Date(updateQuotationDto.quotation_validity),
        quotation_number: updateQuotationDto.quotation_number,
        updated_at: new Date(),
        updated_by: user_id
      }
    })
  }

  async remove(id: number, user_id: number) {
    const quotation = await this.dbService.quotation.update({
      where: {
        id
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user_id,
      }
    })
  }
}
