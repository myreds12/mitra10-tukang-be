import { Body, Controller, HttpStatus, Param, Post, Query, Request, Res, UseGuards, Get, Patch, Delete } from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { CreateWorkOrderDto } from './dto/create.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { response } from 'express';
import { UpdateWorkOrderDto } from './dto/update.dto';

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) { }
  @Post()
  async create(@Body() dataDto: CreateWorkOrderDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const work_orders = await this.workOrdersService.create(
        dataDto,
        user_id
      )

      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Work Order Created',
        data: work_orders
      })
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message,
        stack: error
      })
    }
  }

  @Get()
  async findAll(@Query() queryParamsDto: QueryParamsDto, @Res() response) {
    try {
      const work_orders = await this.workOrdersService.findAll(
        queryParamsDto
      )

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Work Order',
        data: work_orders
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @Res() response) {
    try {
      const work_orders = await this.workOrdersService.findOne(
        id
      )

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Work Order',
        data: work_orders
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error
      })
    }
  }

  @Patch(':id')
  async update(@Param('id') id: number, @Body() dataDto: UpdateWorkOrderDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const work_orders = await this.workOrdersService.update(
        id,
        dataDto,
        user_id
      )

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Work Order Updated',
        data: work_orders
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }


  @Delete(':id')
  async delete(@Param('id') id: number, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id;

      const work_orders = await this.workOrdersService.delete(
        id,
        user_id
      )

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Work Order Deleted',
        data: work_orders
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error
      })
    }
  }
}
