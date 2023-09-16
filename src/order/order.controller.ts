import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { QueryParamsDto } from './dto/query-params.dto';

@Controller('order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('receipt_file', {
      storage: diskStorage({
        destination: './uploads/receipt',
        filename(req, file, callback) {
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async create(
    @UploadedFile() receipt_file: Express.Multer.File,
    @Body() createOrderDto: CreateOrderDto,
    @Request() req,
  ) {
    try {
      console.log(createOrderDto);

      const order = await this.orderService.create(
        createOrderDto,
        req.user,
        receipt_file,
      );

      return {
        status: HttpStatus.CREATED,
        messages: 'Order Created.',
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

  // TODO: UPDATE LOGIC
  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('receipt_file', {
      storage: diskStorage({
        destination: './uploads/receipt',
        filename(req, file, callback) {
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req,
  ) {
    try {
      console.log(id, updateOrderDto, req.user);

      const order = await this.orderService.update(
        id,
        updateOrderDto,
        req.user,
      );

      return {
        status: HttpStatus.OK,
        messages: 'Order Updated.',
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

  // TODO: DELETE LOGIC
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
