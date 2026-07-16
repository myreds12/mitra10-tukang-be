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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';

@ApiTags('Quotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quotation')
export class QuotationController {
  constructor(
    private readonly quotationService: QuotationService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly dbService: PrismaService,
  ) {}

  @Post('/update-quotation-promotion')
  @ApiOperation({
    summary: 'Update Quotation Promotion',
    description: 'Update promotion settings for quotations',
  })
  @ApiResponse({ status: 200, description: 'Promotion updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateQuotationPromotion() {
    return await this.quotationService.updatePromotionQuotation();
  }

  @Post('/duplicate-incentive/:id')
  @ApiOperation({
    summary: 'Duplicate Incentive from Quotation',
    description: 'Create a duplicate of incentive settings from an existing quotation',
  })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: String })
  @ApiResponse({ status: 200, description: 'Incentive duplicated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async duplicatesIncentive(@Param('id') id: string) {
    return await this.quotationService.incentiveDuplicate(+id);
  }

  @Get('/export-excel-follow-up')
  @ApiOperation({
    summary: 'Export Quotations Follow-up to Excel',
    description: 'Export quotations with follow-up status to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async quotationExportExcelFollowUp(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationService.quotationExportExcelFollowUp(res, query);
  }

  @Post('/follow-up')
  @ApiOperation({
    summary: 'Create Follow-up Quotation',
    description: 'Create a follow-up quotation from existing quotation',
  })
  @ApiResponse({ status: 201, description: 'Follow-up quotation created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async quotationFollowUp(
    @Body() createQuotationFollowUp: CreateQuotationDto,
    @Req() req: RequestWithUser,
  ) {
    return await this.quotationService.quotationFollowUp(createQuotationFollowUp, req.user);
  }

  @Get('/send-mail/:id')
  @ApiOperation({
    summary: 'Send Quotation Email',
    description: 'Queue email notification for a quotation to be sent',
  })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: Number })
  @ApiResponse({ status: 200, description: 'Email queued successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  async testMail(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.quotationService.findOne(id);
      if (!data) new NotFoundException('Order not found');

      const message = await this.dbService.email_messages.findFirst({
        where: { email_type: MailType.QUOTATIONS },
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
  @ApiOperation({
    summary: 'Export Quotations to Excel',
    description: 'Export filtered quotations to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.quotationService.quotationExportExcel(res, query);
  }

  @Get('next-code')
  @ApiOperation({
    summary: 'Get Next Quotation Code',
    description: 'Get the next available quotation code/number',
  })
  @ApiResponse({ status: 200, description: 'Next code retrieved' })
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
  @ApiOperation({
    summary: 'Set Quotation Status',
    description: 'Update quotation status. Triggers late quotation violation detection when quotation is created.',
  })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: Number })
  @ApiParam({ name: 'status_id', description: 'New Status ID', type: Number })
  @ApiResponse({ status: 200, description: 'Quotation status updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Quotation or Status not found' })
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status_id', ParseIntPipe) status_id: number,
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
  @ApiOperation({
    summary: 'Create New Quotation',
    description: 'Create a new quotation with file attachments',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Quotation created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('quotation_files'))
  async create(
    @Body() createQuotationDto: CreateQuotationDto,
    @UploadedFiles() quotation_files: Express.Multer.File[],
    @Req() req: RequestWithUser,
  ) {
    try {
      const user = req.user;
      return await this.quotationService.create(createQuotationDto, user, quotation_files);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get All Quotations',
    description: 'Retrieve paginated list of all quotations with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved quotations' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() queryParamsDto: QueryParamsDto) {
    try {
      return await this.quotationService.findAll(queryParamsDto);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Quotation by ID',
    description: 'Retrieve a specific quotation by its ID with full details',
  })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: String })
  @ApiResponse({ status: 200, description: 'Successfully retrieved quotation' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  async findOne(@Param('id') id: string) {
    try {
      return await this.quotationService.findOne(+id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Post(':id')
  @ApiOperation({
    summary: 'Update Quotation',
    description: 'Update an existing quotation with new data and/or files',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Quotation ID to update', type: String })
  @ApiResponse({ status: 200, description: 'Quotation updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
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
      return await this.quotationService.update(+id, updateQuotationDto, user, files);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Quotation',
    description: 'Delete a quotation by ID',
  })
  @ApiParam({ name: 'id', description: 'Quotation ID to delete', type: String })
  @ApiResponse({ status: 200, description: 'Quotation deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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