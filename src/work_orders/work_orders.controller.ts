import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  Get,
  Delete,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { CreateWorkOrderDto } from './dto/create.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { response } from 'express';
import { UpdateWorkOrderDto } from './dto/update.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { users } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Work Orders')
@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}
  @Post()
  @UseInterceptors(FilesInterceptor('work_order_evidences', 5))
  async create(
    @Body() dataDto: CreateWorkOrderDto,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
  ) {
    try {
      if (!dataDto.work_order_tukang)
        throw new BadRequestException('Tukang cannot be null');
      // THROW NEW ERROR WHEN NO TUKANG
      if (!dataDto.work_order_tukang.length)
        throw new BadRequestException('Tukang should be an one or many.');

      const work_orders = await this.workOrdersService.create(
        dataDto,
        req.user,
        work_order_evidences,
      );

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Work Order Created',
        data: work_orders,
      });
    } catch (error) {
      console.log(error);

      return res.status(error.response.statusCode).json(error);
    }
  }

  @Get()
  async findAll(
    @Query() queryParamsDto: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    try {
      const { data, skip, page, take, total } =
        await this.workOrdersService.findAll(queryParamsDto);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Work Order',
        data,
        total,
        page,
        take,
        skip,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @Res() res: IExpressResponse) {
    try {
      const work_orders = await this.workOrdersService.findOne(id);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Work Order',
        data: work_orders,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error,
      });
    }
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('work_order_evidences', 5))
  async update(
    @Param('id') id: number,
    @Body() dataDto: UpdateWorkOrderDto,
    @Request() req: UserRequest,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
    @Res() res: IExpressResponse,
  ) {
    try {
      console.log(
        'work order update : ',
        id,
        dataDto,
        req.user,
        work_order_evidences,
      );

      const work_orders = await this.workOrdersService.update(
        id,
        dataDto,
        req.user,
        work_order_evidences,
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Work Order Updated',
        data: work_orders,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error.message,
      });
    }
  }

  @Delete(':id')
  async delete(
    @Param('id') id: number,
    @Request() req,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user_id = req.user.id;

      const work_orders = await this.workOrdersService.delete(id, user_id);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Work Order Deleted',
        data: work_orders,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error,
      });
    }
  }
}
