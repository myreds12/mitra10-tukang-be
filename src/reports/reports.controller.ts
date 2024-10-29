import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { OrderService } from 'src/order/order.service';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { FormDto } from './dto/create-form.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly orderService: OrderService,
  ) { }

  @Get('/general-report')
  async generateStaticReport(@Query() query: QueryParamsDto ,@Res() res: IExpressResponse
  ) {
    const outputPath = 'static_booking_report.xlsx';
    await this.reportsService.generalReport(query ,res);
    return { message: 'Laporan statis berhasil dibuat', path: outputPath };
  }

  // @Get('/general/export-excel')
  // async invoiceRekonselExportExcel(
  //   @Res() res: IExpressResponse,
  // ) {
  //   return await this.reportsService.generalReport(res);
  // }

  @Get('/vendor')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportVendor(@Query() query: QueryParamsDto) {
    return await this.reportsService.reportVendor(query);
  }

  @Get('/tukang')
  async reportTukang(@Query() query: QueryParamsDto) {
    return await this.reportsService.reportTukang(query);
  }

  @Get('/complaints')
  async complaintReport(@Query() queryParamsDto: QueryParamsDto) {
    return await this.reportsService.reportComplaint(queryParamsDto);
  }

  @Get('/sales-comission')
  async salesComission(@Query() queryParamsDto: QueryParamsDto) {
    return await this.reportsService.salesComissionReport(queryParamsDto);
  }

  @Post()
  create(@Body() createReportDto: CreateReportDto) {
    return this.reportsService.create(createReportDto);
  }

  @Get('/orders')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportOrders(@Query() query: QueryParamsDto) {
    return await this.reportsService.reportOrder(query);
  }

  @Get('/work-orders')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportWorkOrder(@Query() query: QueryParamsDto) {
    return await this.reportsService.reportWorkOrder(query);
  }

  @Get()
  findAll() {
    return this.reportsService.findAll();
  }
}
