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
  ) {}

  @Get('/vendor')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportVendor(@Query() query: QueryParamsDto) {
    try {
      const data =
        await this.reportsService.reportVendor(query);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data
      };
    } catch (error) {
      console.log(error.message);
      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Get('/tukang')
  async reportTukang(@Query() query: QueryParamsDto, @Res() response){
    try {
      const tukang = await this.reportsService.reportTukang(query);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Tukang',
        data: tukang
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  } 

  @Get('/complaints')
  async complaintReport(@Query() queryParamsDto: QueryParamsDto, @Res() response) {
    try {
      const {complaint, complaintGrandTotal, monthlyComplaint} = await this.reportsService.complaintReport(queryParamsDto);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Complaint',
        data: complaint,
        complaintGrandTotal,
        monthlyComplaint
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get('/sales-comission')
  async salesComission(@Res() response, @Query() queryParamsDto: QueryParamsDto){
    try {
      const {data, page, take, total} = await  this.reportsService.salesComissionReport(queryParamsDto);
      return response.status(200).json({
        data,
        page,
        take,
        total,
        status: HttpStatus.OK,
        message: 'Get Sales Comission',
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }
  @Post('/create-form')
  createForm(@Body() dto: FormDto, @Req() req: Request) {
    return this.reportsService.createForm(dto);
  }

  @Post()
  create(@Body() createReportDto: CreateReportDto) {
    return this.reportsService.create(createReportDto);
  }

  @Get('/orders')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportOrders(@Query() query: QueryParamsDto) {
    try {
      const { data, total, orderGrandTotal, monthlyOrders  } =
        await this.reportsService.reportOrder(query);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data,
        total,
        orderGrandTotal,
        monthlyOrders,
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Get('/work-orders')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async reportWorkOrder(@Query() query: QueryParamsDto) {
    try {
      const { data, total,  monthlyWorkOrders  } =
        await this.reportsService.reportWorkOrder(query);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data,
        total,
        monthlyWorkOrders,
      };
    } catch (error) {
      console.log(error.message);
      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Get()
  findAll() {
    return this.reportsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto) {
    return this.reportsService.update(+id, updateReportDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportsService.remove(+id);
  }


}
