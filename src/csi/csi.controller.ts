import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  HttpStatus,
  UseGuards,
  Query,
  HttpCode,
} from '@nestjs/common';
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
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCsiDto: CreateCsiDto) {
    try {
      const data = await this.csiService.create(createCsiDto);
      return {
        statusCode: HttpStatus.CREATED,
        status: 'CREATED',
        message: 'CSI Created',
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const data = await this.csiService.findAll(query);
      return {
        statusCode: HttpStatus.OK,
        status: 'OK',
        message: 'Success',
        data: data.data,
        ...data.options,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    try {
      const data = await this.csiService.findOne(+id);
      return {
        data,
        statusCode: HttpStatus.OK,
        status: 'OK',
        message: 'Success',
      };
    } catch (error) {
      throw error;
    }
  }

  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() updateCsiDto: UpdateCsiDto) {
    try {
      const data = await this.csiService.update(+id, updateCsiDto);
      return {
        data,
        statusCode: HttpStatus.OK,
        status: 'OK',
        message: 'Success',
      };
    } catch (error) {
      throw error;
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.csiService.remove(+id);
  }

  @Get('/get/spreadsheet')
  async getDataSpreadsheet(@Res() res: IExpressResponse) {
    try {
      const getData = await this.csiService.getDataCsi();
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: getData,
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
  async postDataSpreadsheet(@Res() res: IExpressResponse) {
    try {
      const postData = await this.csiService.insertCSIToDatabase();
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: postData,
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
  async getCSIData(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    try {
      const getData = await this.csiService.getCsiFromDatabase(query);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: getData,
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
