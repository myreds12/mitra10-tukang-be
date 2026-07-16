/* eslint-disable prettier/prettier */
import { Controller, Get, UseGuards, Query, HttpStatus, Post, Body, Request, Param, Delete } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { DataMasterService } from './dataMaster.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { CreateDataMasterDto } from './dto/create-data-master.dto';

@UseGuards(JwtAuthGuard)
@Controller('data-master')
export class DataMasterController {
  constructor(private readonly dataMasterService: DataMasterService) { }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const data = await this.dataMasterService.findAll(query);
      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return await this.dataMasterService.findOne(+id);
  }
  @Post('/')
  async create(
    @Body() createDataMasterDto: CreateDataMasterDto,
    @Request() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return await this.dataMasterService.create(createDataMasterDto, user_id);
  }
  @Post('/:id')
  async update(
    @Param('id') id: string,
    @Body() createDataMasterDto: CreateDataMasterDto,
    @Request() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return await this.dataMasterService.update(+id, createDataMasterDto, user_id);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return await this.dataMasterService.remove(+id);
  }
}
