import { Controller, Get, Post, Body, Patch, Param, Delete, Request, Res, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('quotation')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) { }

  @Post()
  async create(@Body() createQuotationDto: CreateQuotationDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const quotation = await this.quotationService.create(createQuotationDto, user_id);

      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Quotation Created',
        data: quotation
      })
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }

  }

  @Get()
  async findAll(@Query() queryParamsDto: QueryParamsDto, @Res() response) {
    try {
      const quotation = await this.quotationService.findAll(queryParamsDto);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Quotation',
        data: quotation
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }

  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const quotation = await this.quotationService.findOne(+id);


      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Quotation',
        data: quotation
      })

    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error
      })
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateQuotationDto: UpdateQuotationDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const quotation = await this.quotationService.update(+id, updateQuotationDto, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation Updated',
        data: quotation
      })
    } catch (error) {

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const quotation = await this.quotationService.remove(+id, user_id);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation Deleted',
        data: quotation
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }
}
