import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseIntPipe,
  Req,
  Res,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { Prisma, menus, users } from '@prisma/client';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from './dto/query-params.dto';
import { CheckPermissions } from 'src/casl/decorator/permission.decorator';
import { PermissionsGuard } from 'src/casl/guards/permissions.guard';
import { PermissionAction } from 'src/casl/enum/permission-action.enum';

interface UserRequest extends IExpressRequest {
  user: users;
}
const menuName = 'orders';
@Controller(menuName)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':id/counter')
  async counter(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: IExpressResponse,
  ) {
    try {
      const order = await this.orderService.counter(id);

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Order Updated.',
        data: order,
      });
    } catch (error) {
      console.log(error.message);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Post('/')
  @CheckPermissions([PermissionAction.CREATE, menuName])
  @UseInterceptors(FileInterceptor('receipt_file'))
  async create(
    @UploadedFile() receipt_file: Express.Multer.File,
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const order = await this.orderService.create(
        createOrderDto,
        req.user,
        receipt_file,
      );

      return res.status(201).json({
        status: HttpStatus.CREATED,
        messages: 'Order Created.',
        data: order,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Get('/')
  @CheckPermissions([PermissionAction.READ, menuName])
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const orders = await this.orderService.findAll(query);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data: orders,
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

  @Get(':id')
  @CheckPermissions([PermissionAction.READ, menuName])
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      const order = await this.orderService.findOne(id);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data: order,
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

  @Post(':id')
  @CheckPermissions([PermissionAction.UPDATE, menuName])
  @UseInterceptors(FileInterceptor('receipt_file'))
  async update(
    @UploadedFile() receipt_file: Express.Multer.File,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const order = await this.orderService.update(
        id,
        updateOrderDto,
        req.user,
        receipt_file,
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Order Updated.',
        data: order,
      });
    } catch (error) {
      console.log(error.message);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Delete(':id')
  @CheckPermissions([PermissionAction.DELETE, menuName])
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
