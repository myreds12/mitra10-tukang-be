/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Query,
  ParseIntPipe,
  Req,
  Res,
  BadRequestException,
  UploadedFiles,
  NotFoundException,
  Logger,
  HttpCode,
  UseFilters,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CreateMemberDto } from 'src/member/dto/create-member.dto';
import { NotFoundExceptionFilter } from 'src/common/filters/not-found-exceptopm.filter';
import { BadRequestExceptionFilter } from 'src/common/filters/bad-request-exception.filter';
// import { CheckPermissions } from 'src/casl/decorator/permission.decorator';
// import { PermissionsGuard } from 'src/casl/guards/permissions.guard';
// import { PermissionAction } from 'src/casl/enum/permission-action.enum';

interface UserRequest extends IExpressRequest {
  user: users;
}
const menuName = 'orders';

@ApiTags('Orders')
@Controller(menuName)
// @UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }
  private readonly logger = new Logger(OrderController.name);

  @Post('/public')
  // @CheckPermissions([PermissionAction.CREATE, menuName])
  @UseFilters(NotFoundExceptionFilter, BadRequestExceptionFilter)
  @UseInterceptors(FilesInterceptor('order_files'))
  async createPublic(
    @Body() createOrderDto: CreateOrderDto,
    @Body() createMemberDto: CreateMemberDto,
  ) {
    try {
      if (!createOrderDto.order_details)
        throw new BadRequestException('Order Details cannot be null.');
      if (!createOrderDto.order_details.length)
        throw new BadRequestException(
          'Order Details should be an one or many.',
        );

      const order = await this.orderService.createOrderPublic(
        createOrderDto,
        createMemberDto
      );
      // await this.sendEmailService.sendMail(order.id);

      return order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  @Post('/history/:id')
  @UseGuards(JwtAuthGuard)
  async deleteHistory(
    @Param('id', ParseIntPipe) id: number,
  ) {
    try {
      const order = await this.orderService.deleteHistory(
        id,
      );

      return order;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  @Post('/receipt-public/:id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'receipt_order', maxCount: 10 },
      { name: 'quotation_receipt_customer', maxCount: 10 },
    ]),
  )
  @UseGuards()
  async updateReceiptPublic(
    @Param('id') id: string,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      // console.log(id);
      // console.log(files);
      return await this.orderService.updateReceiptPublic(
        +id,
        files,
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get('/export-excel-follow-up')
  @UseGuards(JwtAuthGuard)
  async orderExportExcelFollowUp(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcelFollowUp(res, query);
  }

  @Get('/export-pdf-follow-up')
  @UseGuards(JwtAuthGuard)
  async orderFollowUpExportPdf(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse) {
    const data = await this.orderService.orderFollowUpPdf(res, query);
    return data;
  }

  @Post('/follow-up')
  @UseGuards(JwtAuthGuard)
  async orderFollowUp(@Body() createOrderFollowUp: CreateOrderDto, @Req() req: UserRequest) {
    return await this.orderService.orderFollowUp(createOrderFollowUp, req.user);
  }

  @Get('/quotation-pdf/:order_id')
  async downloadPdf(@Param('order_id', ParseIntPipe) order_id: number, @Res() res: IExpressResponse) {
    return await this.orderService.quotationPdf(order_id, res);
  }

  @Get('/export-excel-ho')
  @UseGuards(JwtAuthGuard)
  async orderExportExcelHO(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcelHO(res, query);
  }

  @Get('/calender')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async orderCalender(@Query() query: QueryParamsDto) {
    try {
      return await this.orderService.orderCalender(query);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get('/export-excel')
  @UseGuards(JwtAuthGuard)
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcel(res, query);
  }

  @Get('/check')
  async getOrderDetailPublic(@Query() query: QueryParamsDto) {
    if (!query.order_id)
      throw new BadRequestException('Order ID cannot be null.');

    return await this.orderService.orderDetailsPublic(query);
  }

  @Get('/data')
  @UseGuards()
  async dataOrderDetailPublic(@Query() query: QueryParamsDto) {
    return await this.orderService.orderDetailsPublic(query);
  }

  @Post(':id/set-status/:status_id')
  @UseGuards(JwtAuthGuard)
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status_id', ParseIntPipe) status_id: number,
    @Req() req: UserRequest,
  ) {
    const user = req.user;

    return await this.orderService.setStatus(id, status_id, user);
  }

  @Get('/public/get')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards()
  @HttpCode(HttpStatus.OK)
  async publicGetAll(@Query() query: QueryParamsDto) {
    return await this.orderService.findAll(query);
  }

  @Get('/send-mail/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testMail(@Param('id', ParseIntPipe) id: number) {
    try {
      const { data: order } = await this.orderService.findOne(id);
      if (!order) new NotFoundException('Order not found');

      this.logger.verbose(
        'Sending Email',
        this.emailQueue.client.status,
        order,
      );

      await this.emailQueue.add('send-order-mail', {
        module_id: order.id,
      });
    } catch (error) {
      throw error;
    }
  }

  @Post(':id/counter')
  @UseGuards(JwtAuthGuard)
  async counter(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.orderService.counter(id);
    } catch (error) {
      console.log(error.message);
      throw error;
    }
  }

  @Post('/')
  // @CheckPermissions([PermissionAction.CREATE, menuName])
  @UseInterceptors(FilesInterceptor('order_files'))
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: UserRequest,
    @UploadedFiles() order_files: Array<Express.Multer.File>,
  ) {
    try {
      // Cek di dTO ada updateTukangDto?.service_types
      if (!createOrderDto.order_details)
        throw new BadRequestException('Order Details cannot be null.');
      if (!createOrderDto.order_details.length)
        throw new BadRequestException(
          'Order Details should be an one or many.',
        );

      const order = await this.orderService.create(
        createOrderDto,
        req.user,
        order_files,
      );
      // await this.sendEmailService.sendMail(order.id);

      return order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get('/')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryParamsDto) {
    try {
      return await this.orderService.findAll(query);
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  //FIXME : UNTUK PUG TIDAK BISA MEN INCLUDE CSS DAN IMAGE, MENGGUNAKAN CONTROLLER FIND ONE AGAR MUDAH FETCH DATANYA
  @Get(':id')
  // @Render('index')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.orderService.findOne(id);
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  @Post(':id')
  // @CheckPermissions([PermissionAction.UPDATE, menuName])
  @UseInterceptors(FilesInterceptor('order_files'))
  @UseGuards(JwtAuthGuard)
  async update(
    @UploadedFiles() order_files: Array<Express.Multer.File>,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: UserRequest,
  ) {
    try {
      const order = await this.orderService.update(
        id,
        updateOrderDto,
        req.user,
        order_files,
      );

      return order;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  @Delete(':id')
  // @CheckPermissions([PermissionAction.DELETE, menuName])
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
