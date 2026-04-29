import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  Req,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { QuotationPromotionService } from './quotation_promotion.service';
import { CreateQuotationPromotionDto } from './dto/create-quotation_promotion.dto';
import { UpdateQuotationPromotionDto } from './dto/update-quotation_promotion.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response as IExpressResponse } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('quotation-promotion')
export class QuotationPromotionController {
  constructor(
    private readonly quotationPromotionService: QuotationPromotionService,
  ) {}

  @Get('/:quotation_id/pdf')
  async downloadPdf(
    @Param('quotation_id', ParseIntPipe) quotation_id: number,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationPromotionService.quotationPdf(quotation_id, res);
  }

  @Get('/:id/export-excel')
  async promotionRequestExportExcel(
    @Param('id') id: string,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationPromotionService.promotionRequest(+id, res);
  }

  @Get('next-code')
  async getCode() {
    try {
      const code = await this.quotationPromotionService.nextCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return { code: nextCode };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post()
  @UseInterceptors(FilesInterceptor('quotation_promotion_evidences'))
  async create(
    @Body() createQuotationPromotionDto: CreateQuotationPromotionDto,
    @UploadedFiles() quotation_promotion_evidences: Express.Multer.File[],
    @Req() req: RequestWithUser,
  ) {
    return await this.quotationPromotionService.create(
      createQuotationPromotionDto,
      quotation_promotion_evidences,
      req.user,
    );
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.quotationPromotionService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.quotationPromotionService.findOne(+id);
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('quotation_promotion_evidences'))
  async update(
    @Param('id') id: string,
    @Body() updateQuotationPromotionDto: UpdateQuotationPromotionDto,
    @UploadedFiles() quotation_promotion_evidences: Express.Multer.File[],
    @Req() req: RequestWithUser,
  ) {
    return await this.quotationPromotionService.update(
      +id,
      updateQuotationPromotionDto,
      quotation_promotion_evidences,
      req.user,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return await this.quotationPromotionService.remove(+id, req.user);
  }
}
