import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  HttpStatus,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { RefundService } from './refund.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { UpdateRefundDto } from './dto/update-refund.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('refund')
export class RefundController {
  constructor(private readonly refundService: RefundService) { }

  @Post()
  @UseInterceptors(FilesInterceptor('refund_evidences'))
  async create(
    @UploadedFiles() refund_evidences: Array<Express.Multer.File>,
    @Body() createRefundDto: CreateRefundDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const refund = await this.refundService.create(
        createRefundDto,
        user,
        refund_evidences,
      );
      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Refund Created',
        data: refund,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const { data, total, skip, page, take, takeTotal } =
        await this.refundService.findAll(query);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Refund',
        data,
        total,
        takeTotal,
        skip,
        page,
        take,
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

  @Get(':id')
  async findOne(@Param('id') id: number, @Res() res: IExpressResponse) {
    try {
      const refund = await this.refundService.findOne(id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Refund',
        data: refund,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('refunds_evidences'))
  async update(
    @Param('id') id: number,
    @Body() updateRefundDto: UpdateRefundDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
    @UploadedFiles() refunds_evidences: Array<Express.Multer.File>,
  ) {
    try {
      const user = req.user;
      const refund = await this.refundService.update(
        id,
        updateRefundDto,
        user,
        refunds_evidences,
      );
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Refund Updated',
        data: refund,
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.refundService.remove(+id);
  }
}
