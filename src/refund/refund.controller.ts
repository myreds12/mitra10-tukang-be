import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  Res,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { RefundService } from './refund.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { UpdateRefundDto } from './dto/update-refund.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { Response as IExpressResponse } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('refund')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Get('/export-excel')
  async refundExportExcel(
    @Res() res: IExpressResponse,
    @Query() query: QueryParamsDto,
  ) {
    return await this.refundService.refundExportExcel(res, query);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('refund_evidences'))
  async create(
    @UploadedFiles() refund_evidences: Array<Express.Multer.File>,
    @Body() createRefundDto: CreateRefundDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return await this.refundService.create(
      createRefundDto,
      user,
      refund_evidences,
    );
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.refundService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return await this.refundService.findOne(id);
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('refunds_evidences'))
  async update(
    @Param('id') id: number,
    @Body() updateRefundDto: UpdateRefundDto,
    @Req() req: RequestWithUser,
    @UploadedFiles() refunds_evidences: Array<Express.Multer.File>,
  ) {
    const user = req.user;
    return await this.refundService.update(
      id,
      updateRefundDto,
      user,
      refunds_evidences,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.refundService.remove(+id);
  }
}
