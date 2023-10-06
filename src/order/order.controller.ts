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
import { users } from '@prisma/client';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from './dto/query-params.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  @Post('/create')
  @UseInterceptors(FilesInterceptor('receipt_file', 5))
  async create(
    @UploadedFile() receipt_file: Express.Multer.File,
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {

      const order = await this.orderService.create(
        receipt_file,
        createOrderDto,
        req.user,
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

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const orders = await this.orderService.findAll(query);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data: orders,
        query,
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

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('receipt_file', 5))
  async update(
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
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
