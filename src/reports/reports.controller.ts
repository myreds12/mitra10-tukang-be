/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { OrderService } from 'src/order/order.service';
import {
  Response as IExpressResponse,
} from 'express';


@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly orderService: OrderService,
  ) {}

  @Get('/general-report')
  async generateStaticReport(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    const outputPath = 'static_booking_report.xlsx';
    await this.reportsService.generalReport(query, res);
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
  async reportVendor() {
    return await this.reportsService.reportVendor();
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

  @Get('/store-comission')
  async storeComission(@Query() queryParamsDto: QueryParamsDto) {
    return await this.reportsService.storeComissionReport(queryParamsDto);
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
}
