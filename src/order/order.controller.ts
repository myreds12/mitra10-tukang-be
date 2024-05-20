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
  Query,
  ParseIntPipe,
  Req,
  Res,
  BadRequestException,
  UploadedFiles,
  NotFoundException,
  Logger,
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
import { FilesInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
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
  ) {}
  private readonly logger = new Logger(OrderController.name);

  @Get('/check')
  async getOrderDetailPublic(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    try {
      if (!query.order_id)
        throw new BadRequestException('Order ID cannot be null.');
      const { redirect_url } = await this.orderService.orderDetailsPublic(
        query,
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Success',
        redirect_url,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof NotFoundException) {
        return res.status(HttpStatus.NOT_FOUND).json({
          status: HttpStatus.NOT_FOUND,
          messages: error.message,
        });
      }

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Get('/data')
  @UseGuards()
  async dataOrderDetailPublic(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    try {
      const { data } = await this.orderService.orderDetailsPublic(query);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Order Details',
        data,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof NotFoundException) {
        return res.status(HttpStatus.NOT_FOUND).json({
          status: HttpStatus.NOT_FOUND,
          messages: error.message,
        });
      }

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Post(':id/set-status/:status_id')
  @UseGuards(JwtAuthGuard)
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status_id', ParseIntPipe) status_id: number,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const order = await this.orderService.setStatus(id, status_id, user);

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Order Status Updated.',
        data: order,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Get('/public/get')
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards()
  async publicGetAll(@Query() query: QueryParamsDto, @Req() req: UserRequest) {
    try {
      const { data, page, take, total, takeTotal } =
        await this.orderService.findAll(query, req.user);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data,
        page,
        take,
        total,
        takeTotal,
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

  @Get('/send-mail/:id')
  @UseGuards(JwtAuthGuard)
  async testMail(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: IExpressResponse,
  ) {
    try {
      const order = await this.orderService.findOne(id);
      if (!order) new NotFoundException('Order not found');

      this.logger.verbose(
        'Sending Email',
        this.emailQueue.client.status,
        order,
      );

      await this.emailQueue.add('send-order-mail', {
        order_id: order.id,
      });

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Email Order Success',
        data: null,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Post(':id/counter')
  @UseGuards(JwtAuthGuard)
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
  // @CheckPermissions([PermissionAction.CREATE, menuName])
  @UseInterceptors(FilesInterceptor('order_files'))
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: UserRequest,
    @UploadedFiles() order_files: Array<Express.Multer.File>,
    @Res() res: IExpressResponse,
  ) {
    try {
      console.log(createOrderDto);

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
      if (
        order.status.category === 'BOOKED' ||
        order.status.category === 'WORKREQ' ||
        order.status.category === 'SURVEYREQ'
      ) {
        await this.emailQueue.add(
          'send-order-mail',
          {
            order_id: order.id,
          },
          {
            attempts: 3,
          },
        );
      }

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
  // @CheckPermissions([PermissionAction.READ, menuName])
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryParamsDto, @Req() req: UserRequest) {
    try {
      const {
        data,
        page,
        take,
        total,
        takeTotal,
        // monthlyOrders,
      } = await this.orderService.findAll(query, req.user);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data,
        page,
        take,
        total,
        takeTotal,
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

  //FIXME : UNTUK PUG TIDAK BISA MEN INCLUDE CSS DAN IMAGE, MENGGUNAKAN CONTROLLER FIND ONE AGAR MUDAH FETCH DATANYA
  @Get(':id')
  // @Render('index')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      const order = await this.orderService.findOne(id);
      // console.log(order);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data: order,
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

  @Post(':id')
  // @CheckPermissions([PermissionAction.UPDATE, menuName])
  @UseInterceptors(FilesInterceptor('order_files'))
  @UseGuards(JwtAuthGuard)
  async update(
    @UploadedFiles() order_files: Array<Express.Multer.File>,
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
        order_files,
      );
      if (
        order.status.category === 'BOOKED' ||
        order.status.category === 'WORKREQ' ||
        order.status.category === 'SURVEYREQ'
      ) {
        await this.emailQueue.add(
          'send-order-mail',
          {
            order_id: order.id,
          },
          {
            attempts: 3,
          },
        );
      }

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Order Updated.',
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

  @Delete(':id')
  // @CheckPermissions([PermissionAction.DELETE, menuName])
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
