import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update.dto';

@Injectable()
export class WorkOrdersService {
    constructor(private readonly dbService: PrismaService) { }

    async create(dataDto: CreateWorkOrderDto, user_id: number) {
        const work_orders = await this.dbService.work_orders.create({
            data: {
                order: {
                    connect: {
                        id: dataDto.order_id
                    }
                },
                tukang: {
                    connect: {
                        id: dataDto.tukang_id
                    }
                },
                vendor: {
                    connect: {
                        id: dataDto.vendor_id
                    }
                },
                request_work_time: new Date(dataDto.request_work_time),
                survey_date: new Date(dataDto.survey_date),
                work_end_date: new Date(dataDto.work_end_date),
                work_start_date: new Date(dataDto.work_start_date),
                complaint_status: dataDto.complaint_status,
                worker_order_status: dataDto.work_order_status,
                created_by: user_id
            }
        })

        return work_orders
    }

    async findAll(queryParamsDto: QueryParamsDto) {
        const { skip, limit, search, date_from, date_to } = queryParamsDto
        const work_orders = await this.dbService.work_orders.findMany({
            skip: skip,
            take: limit,
            where: {
                request_work_time: {
                    gte: search
                },
                survey_date: {
                    gte: search
                }
            }
        })

        return work_orders
    }

    async findOne(id: number) {
        const work_orders = await this.dbService.work_orders.findFirst({
            where: {
                id
            }
        })

        return work_orders
    }

    async update(id: number, dataDto: UpdateWorkOrderDto, user_id: number) {
        const work_orders = await this.dbService.work_orders.update({
            where: {
                id
            },
            data: {
                order_id: dataDto.order_id,
                request_work_time: new Date(dataDto.request_work_time),
                survey_date: new Date(dataDto.survey_date),
                work_end_date: new Date(dataDto.work_end_date),
                work_start_date: new Date(dataDto.work_start_date),
                updated_at: new Date(),
                updated_by: user_id
            }
        })

        return work_orders
    }

    async delete(id: number, user_id: number) {
        const work_orders = await this.dbService.work_orders.update({
            where: {
                id
            },
            data: {
                deleted_at: new Date,
                deleted_by: user_id
            }
        })
    }
}
