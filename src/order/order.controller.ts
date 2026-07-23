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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
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
@ApiBearerAuth()
@Controller(menuName)
// @UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }
  private readonly logger = new Logger(OrderController.name);

  @Post('/public')
  @ApiOperation({
    summary: '[PUBLIC] Create Order (with new member)',
    description: 'Create a new order with new member registration. Used for public customers placing orders.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
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
      return order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post('/history/:id')
  @ApiOperation({
    summary: 'Delete Order History',
    description: 'Soft delete an order by marking it as deleted in history',
  })
  @ApiParam({ name: 'id', description: 'Order ID to delete', type: Number })
  @ApiResponse({ status: 200, description: 'Order history deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async deleteHistory(
    @Param('id', ParseIntPipe) id: number,
  ) {
    try {
      const order = await this.orderService.deleteHistory(id);
      return order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post('/receipt-public/:id')
  @ApiOperation({
    summary: '[PUBLIC] Upload Order Receipt',
    description: 'Upload receipt images for an order (receipt_order and quotation_receipt_customer)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Order ID', type: String })
  @ApiResponse({ status: 200, description: 'Receipt uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file upload' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'receipt_order', maxCount: 10 },
      { name: 'quotation_receipt_customer', maxCount: 10 },
    ]),
  )
  async updateReceiptPublic(
    @Param('id') id: string,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      return await this.orderService.updateReceiptPublic(+id, files);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get('/export-excel-follow-up')
  @ApiOperation({
    summary: 'Export Orders Follow-up to Excel',
    description: 'Export orders with follow-up status to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async orderExportExcelFollowUp(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcelFollowUp(res, query);
  }

  @Get('/export-pdf-follow-up')
  @ApiOperation({
    summary: 'Export Orders Follow-up to PDF',
    description: 'Export orders with follow-up status to PDF file',
  })
  @ApiResponse({ status: 200, description: 'PDF file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async orderFollowUpExportPdf(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse) {
    const data = await this.orderService.orderFollowUpPdf(res, query);
    return data;
  }

  @Post('/follow-up')
  @ApiOperation({
    summary: 'Create Follow-up Order',
    description: 'Create a follow-up order from existing order',
  })
  @ApiResponse({ status: 201, description: 'Follow-up order created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async orderFollowUp(@Body() createOrderFollowUp: CreateOrderDto, @Req() req: UserRequest) {
    return await this.orderService.orderFollowUp(createOrderFollowUp, req.user);
  }

  @Get(['/quotation-pdf/:order_id', '/quotation-pdf/:order_id/:filename'])
  @ApiOperation({
    summary: 'Download Quotation PDF',
    description: 'Generate and download quotation PDF for an order',
  })
  @ApiParam({ name: 'order_id', description: 'Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'PDF file generated' })
  async downloadPdf(@Param('order_id', ParseIntPipe) order_id: number, @Res() res: IExpressResponse) {
    return await this.orderService.quotationPdf(order_id, res);
  }

  @Get('/export-excel-ho')
  @ApiOperation({
    summary: 'Export Orders to Excel (HO)',
    description: 'Export all orders to Excel file for Head Office',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async orderExportExcelHO(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcelHO(res, query);
  }

  @Get('/calender')
  @ApiOperation({
    summary: 'Get Orders Calendar View',
    description: 'Get orders data formatted for calendar view',
  })
  @ApiResponse({ status: 200, description: 'Calendar data retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({
    summary: 'Export Orders to Excel',
    description: 'Export filtered orders to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.orderService.orderExportExcel(res, query);
  }

  @Get('/check')
  @ApiOperation({
    summary: '[PUBLIC] Check Order by ID',
    description: 'Public endpoint to check order status by order_id',
  })
  @ApiQuery({ name: 'order_id', description: 'Order ID to check', type: Number })
  @ApiResponse({ status: 200, description: 'Order details retrieved' })
  @ApiResponse({ status: 400, description: 'Order ID is required' })
  async getOrderDetailPublic(@Query() query: QueryParamsDto) {
    if (!query.order_id)
      throw new BadRequestException('Order ID cannot be null.');
    return await this.orderService.orderDetailsPublic(query);
  }

  @Get('/data')
  @ApiOperation({
    summary: '[PUBLIC] Get Order Data',
    description: 'Public endpoint to get order data details',
  })
  @ApiResponse({ status: 200, description: 'Order data retrieved' })
  async dataOrderDetailPublic(@Query() query: QueryParamsDto) {
    return await this.orderService.orderDetailsPublic(query);
  }

  @Post(':id/set-status/:status_id')
  @ApiOperation({
    summary: 'Set Order Status',
    description: 'Update order status to a new status. Triggers violation detection for certain status changes.',
  })
  @ApiParam({ name: 'id', description: 'Order ID', type: Number })
  @ApiParam({ name: 'status_id', description: 'New Status ID', type: Number })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order or Status not found' })
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
  @ApiOperation({
    summary: '[PUBLIC] Get All Orders',
    description: 'Public endpoint to retrieve all orders (with filters)',
  })
  @ApiResponse({ status: 200, description: 'Orders retrieved' })
  async publicGetAll(@Query() query: QueryParamsDto) {
    return await this.orderService.findAll(query);
  }

  @Get('/send-mail/:id')
  @ApiOperation({
    summary: 'Send Order Email',
    description: 'Queue email notification for an order to be sent',
  })
  @ApiParam({ name: 'id', description: 'Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Email queued successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
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
  @ApiOperation({
    summary: 'Counter Order',
    description: 'Perform counter (negotiation) action on an order',
  })
  @ApiParam({ name: 'id', description: 'Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Counter action completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({
    summary: 'Create New Order',
    description: 'Create a new order with file attachments',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('order_files'))
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: UserRequest,
    @UploadedFiles() order_files: Array<Express.Multer.File>,
  ) {
    try {
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
      return order;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get('/')
  @ApiOperation({
    summary: 'Get All Orders',
    description: 'Retrieve paginated list of all orders with optional filters (vendor_id, status_id, store_id, date range, etc.)',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryParamsDto) {
    try {
      return await this.orderService.findAll(query);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Order by ID',
    description: 'Retrieve a specific order by its ID with full details',
  })
  @ApiParam({ name: 'id', description: 'Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Successfully retrieved order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
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
  @ApiOperation({
    summary: 'Update Order',
    description: 'Update an existing order with new data and/or file attachments',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Order ID to update', type: Number })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
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
  @ApiOperation({
    summary: 'Delete Order',
    description: 'Delete an order by ID',
  })
  @ApiParam({ name: 'id', description: 'Order ID to delete', type: String })
  @ApiResponse({ status: 200, description: 'Order deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
