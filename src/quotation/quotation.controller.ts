import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Request,
  Res,
  Query,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Req,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { Response as IExpressResponse } from 'express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailType } from 'src/mails/enum/mail_type.enum';

@UseGuards(JwtAuthGuard)
@Controller('quotation')
export class QuotationController {
  constructor(
    private readonly quotationService: QuotationService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly dbService: PrismaService,
  ) {}

  @Post('/update-quotation-promotion')
  @UseGuards(JwtAuthGuard)
  async updateQuotationPromotion() {
    return await this.quotationService.updatePromotionQuotation();
  }

  @Post('/duplicate-incentive/:id')
  @UseGuards(JwtAuthGuard)
  async duplicatesIncentive(@Param('id') id: string) {
    return await this.quotationService.incentiveDuplicate(+id);
  }

  @Get('/export-excel-follow-up')
  @UseGuards(JwtAuthGuard)
  async quotationExportExcelFollowUp(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationService.quotationExportExcelFollowUp(res, query);
  }

  @Post('/follow-up')
  @UseGuards(JwtAuthGuard)
  async quotationFollowUp(
    @Body() createQuotationFollowUp: CreateQuotationDto,
    @Req() req: RequestWithUser,
  ) {
    return await this.quotationService.quotationFollowUp(
      createQuotationFollowUp,
      req.user,
    );
  }

  @Get('/send-mail/:id')
  @UseGuards(JwtAuthGuard)
  // @HttpStatusCode(HttpStatus.OK)
  async testMail(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.quotationService.findOne(id);
      // console.log(data);

      if (!data) new NotFoundException('Order not found');

      // this.logger.verbose(
      //   'Sending Email',
      //   this.emailQueue.client.status,
      //   order,
      // );

      const message = await this.dbService.email_messages.findFirst({
        where: {
          email_type: MailType.QUOTATIONS,
        },
      });

      await this.emailQueue.add('send-quotation-mail', {
        module_id: data.id,
        template_id: message.id,
      });
    } catch (error) {
      throw error;
    }
  }

  @Get('/export-excel')
  @UseGuards()
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationService.quotationExportExcel(res, query);
  }

  @Get('next-code')
  async getCode() {
    try {
      const code = await this.quotationService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return { code: nextCode };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post(':id/set-status/:status_id')
  async setStatus(
    @Param('id') id: number,
    @Param('status_id') status_id: number,
    @Request() req: RequestWithUser,
  ) {
    try {
      const user = req.user;
      return await this.quotationService.setStatus(id, status_id, user);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post()
  @UseInterceptors(FilesInterceptor('quotation_files'))
  async create(
    @Body() createQuotationDto: CreateQuotationDto,
    @UploadedFiles() quotation_files: Express.Multer.File[],
    @Req() req: RequestWithUser,
  ) {
    try {
      const user = req.user;
      return await this.quotationService.create(
        createQuotationDto,
        user,
        quotation_files,
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get()
  async findAll(@Query() queryParamsDto: QueryParamsDto) {
    try {
      return await this.quotationService.findAll(queryParamsDto);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.quotationService.findOne(+id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Post(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'quotation_files', maxCount: 10 },
      { name: 'quotation_receipts', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      const user = req.user;
      return await this.quotationService.update(
        +id,
        updateQuotationDto,
        user,
        files,
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    try {
      const user_id = req.user.id;
      return await this.quotationService.remove(+id, user_id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
