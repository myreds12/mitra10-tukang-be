import { Controller, Get, Post, Body, Patch, Param, Delete, Res, HttpStatus, UseGuards, Query } from '@nestjs/common';
import { CsiService } from './csi.service';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Cron } from '@nestjs/schedule';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('csi')
export class CsiController {
  constructor(private readonly csiService: CsiService) {}

  @Post()
  create(@Body() createCsiDto: CreateCsiDto) {
    return this.csiService.create(createCsiDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.csiService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCsiDto: UpdateCsiDto) {
    return this.csiService.update(+id, updateCsiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.csiService.remove(+id);
  }

  @Get('/get/spreadsheet')
  async getDataSpreadsheet(@Res() res: IExpressResponse){
    try{ 
      const getData = await this.csiService.getDataCsi()
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: getData
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Cron('0 18 * * *')
  @Post('/insert/spreadsheet')
  async postDataSpreadsheet(@Res() res: IExpressResponse){
    try{ 
      const postData = await this.csiService.insertCSIToDatabase()
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: postData
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get('/')
  async getCSIData(@Query() query: QueryParamsDto, @Res() res: IExpressResponse){
    try{
      const getData = await this.csiService.getCsiFromDatabase(query)
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: getData
      });
    } catch (error) {
      console.log(error);
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }
}
