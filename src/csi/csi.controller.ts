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
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { CsiService } from './csi.service';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@UseGuards(JwtAuthGuard)
@Controller('csi')
export class CsiController {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    private readonly csiService: CsiService,
  ) {}

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

  @Get('/:id/fetch-answer')
  async getDataSpreadsheet(
    @Res() res: IExpressResponse,
    @Param('id', ParseIntPipe) id: number,
  ) {
    try {
      const { spreadsheets_link } = await this.csiService.findOne(id);
      const spreadsheetId =
        this.csiService.getSheetIdFromUrl(spreadsheets_link);

      const getData = await this.csiService.fetchGFormAnswers(spreadsheetId);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: getData,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While fetching',
        stack: error,
      });
    }
  }

  @Get('/sync')
  async sync() {
    return this.csiService.syncAnswer();
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

  @Post(':id/send/:orderId')
  @HttpCode(HttpStatus.OK)
  async sendcsimail(id: number, orderId: string) {
    const csi = await this.csiService.findOne(id);
    if (!csi) throw new NotFoundException('CSI not found');

    await this.emailQueue.add('send-csi-email', { id, orderId  });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.csiService.remove(+id);
  }
}
