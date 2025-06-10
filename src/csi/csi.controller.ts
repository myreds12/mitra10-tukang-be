import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpStatus,
  UseGuards,
  Query,
  HttpCode,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { CsiService } from './csi.service';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@UseGuards(JwtAuthGuard)
@Controller('csi')
export class CsiController {
  constructor(private readonly csiService: CsiService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCsiDto: CreateCsiDto) {
    return await this.csiService.create(createCsiDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryParamsDto) {
    return await this.csiService.findAll(query);
  }

  @Get('/:id/fetch-answer')
  @HttpCode(HttpStatus.OK)
  async getDataSpreadsheet(@Param('id', ParseIntPipe) id: number) {
    const { spreadsheets_link } = await this.csiService.findOne(id);
    const spreadsheetId = this.csiService.getSheetIdFromUrl(spreadsheets_link);

    return await this.csiService.fetchGFormAnswers(spreadsheetId);
  }

  @Get('/sync')
  async sync() {
    return this.csiService.syncAnswer();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return await this.csiService.findOne(+id);
  }

  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() updateCsiDto: UpdateCsiDto) {
    return await this.csiService.update(+id, updateCsiDto);
  }

  @Post(':id/send/:orderId')
  @HttpCode(HttpStatus.OK)
  async sendcsimail(
    @Param('id') id: number,
    @Param('orderId') orderId: number,
  ) {
    await this.csiService.sendCsiMail(id, orderId);
  }

  @Get(':id/csi-answers')
  @HttpCode(HttpStatus.OK)
  async getCsiAnswers(@Param('id') id: string) {
    return await this.csiService.findCsiAnswers(+id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    const user_id = request.user.id;
    return await this.csiService.remove(+id, user_id);
  }
}
