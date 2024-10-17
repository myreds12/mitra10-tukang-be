import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MailType } from './enum/mail_type.enum';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { MailsService } from './mails.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard)
@Controller('mails')
export class MailsController {
  constructor(private readonly mailsService: MailsService) {}

  @Delete('/history/:id')
  @HttpCode(200)
  async removeHistory(@Req() req: RequestWithUser, @Param('id') id: string) {
    const user = req.user;
    const data = await this.mailsService.removeHistory(+id, user.id);
    return data;
  }

  @Get('types')
  getAvailableTypes() {
    const enumKeys = Object.keys(MailType).filter((key) => isNaN(Number(key)));
    let result = {};
    for (let i = 0; i < enumKeys.length; i++) {
      result[enumKeys[i]] = MailType[enumKeys[i]];
    }
    return result;
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'header_files', maxCount: 10 },
      { name: 'footer_files', maxCount: 10 },
    ]),
  )  
  async create(
    @Req() req: RequestWithUser,
    @Body() createEmailMessageDto: CreateEmailMessageDto,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[]},
  ) {
    const user = req.user;
    const data = await this.mailsService.create(createEmailMessageDto, user.id, files);
    return data;
  }

  @Get()
  @HttpCode(200)
  async findAll(@Query() query: QueryParamsDto) {
    const data = await this.mailsService.findAll(query);
    return data;
  }

  @Get(':id')
  @HttpCode(200)
  async findOne(@Param('id') id: string) {
    const data = await this.mailsService.findOne(+id);
    return data;
  }

  @Patch(':id')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'header_files', maxCount: 10 },
      { name: 'footer_file', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() updateEmailMessageDto: UpdateEmailMessageDto,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[]},
  ) {
    const user = req.user;
    const data = await this.mailsService.update(
      +id,
      updateEmailMessageDto,
      user.id,
      files
    );

    return data;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    const user = req.user;
    const data = await this.mailsService.remove(+id, user.id);
    return data;
  }
}
