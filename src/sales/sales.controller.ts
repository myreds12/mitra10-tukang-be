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
import { sales, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('next-code')
  async getCode(@Request() req: UserRequest) {
    const code = await this.salesService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @Post('/salesUser/:store_id')
  async salesUser(@Param('store_id') store_id: number) {
    return await this.salesService.salesUser(store_id);
  }

  @Post()
  async create(
    @Body() createSaleDto: CreateSalesDto,
    @Request() req: UserRequest,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.create(createSaleDto, user);
  }

  @Get()
  async findAll(
    @Query() query: QueryParamsDto,
  ): Promise<{ data: sales[]; meta?: any }> {
    return await this.salesService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number): Promise<sales> {
    return await this.salesService.findOne(id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateSaleDto: UpdateSalesDto,
    @Request() req: UserRequest,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.update(id, updateSaleDto, user);
  }

  @Delete('/:id')
  async remove(@Param('id') id: number, @Request() req: UserRequest) {
    const user = req.user;
    return await this.salesService.remove(id, user);
  }
}
