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
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

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
      return await this.orderService.create(
        createOrderDto,
        req.user,
        receipt_file,
      );
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Get()
  findAll() {
    return this.orderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.orderService.update(+id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
