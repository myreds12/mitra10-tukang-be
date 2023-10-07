import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Res, HttpStatus, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import {
  Request as IExpressRequest,
  Response as IExpressResponse
} from 'express';
import { users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

interface UserRequest extends IExpressRequest {
  user: users
}
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) { }

  @Post()
  async create(@Body() createInvoiceDto: CreateInvoiceDto, @Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.create(createInvoiceDto, req.user);

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Invoice Created',
        data: invoice
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.findAll(query)

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Invoice',
        data: invoice
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.findOne(+id)

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Invoice',
        data: invoice
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto, @Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.update(+id, updateInvoiceDto, req.user);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Invoice Updated',
        data: invoice
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.remove(+id, req.user);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Invoice Deleted',
        data: invoice
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error
      })
    }
  }
}
