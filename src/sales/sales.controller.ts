import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  Res,
  Query,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) { }

  @Get('next-code')
  async getCode(@Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const code = await this.salesService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Sales code pulled',
        data: { code: nextCode },
      });
    } catch (error) {
      console.error(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While pulling sales code',
        stack: error,
      });
    }
  }

  @Post()
  async create(
    @Body() createSaleDto: CreateSalesDto,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const { sales } = await this.salesService.create(createSaleDto, user);

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Created',
        data: { ...sales },
        // user: users,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.messsage ?? 'Error While Create',
        stack: error,
      });
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const { data, total, page, take } = await this.salesService.findAll(
        query,
      );
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Data',
        data,
        total,
        page,
        take,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.messsage ?? 'Error While GET',
        stack: error,
      });
    }
  }

  @Get('/:id')
  async findOne(@Param('id') id: number, @Res() res: IExpressResponse) {
    try {
      const sales = await this.salesService.findOne(id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Details Data',
        data: sales,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.messsage ?? 'Error While GET',
        stack: error,
      });
    }
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateSaleDto: UpdateSalesDto,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const sales = await this.salesService.update(id, updateSaleDto, user);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Updated',
        data: sales,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.messsage ?? 'Error While Update',
        stack: error,
      });
    }
  }

  @Delete('/:id')
  async remove(
    @Param('id') id: number,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const sales = await this.salesService.remove(id, user);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Deleted',
        data: sales,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.messsage ?? 'Error While Delete',
        stack: error,
      });
    }
  }
}
