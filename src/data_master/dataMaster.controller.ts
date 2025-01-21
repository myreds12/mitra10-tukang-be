/* eslint-disable prettier/prettier */
import { Controller, Get, UseGuards, Query, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { DataMasterService } from './dataMaster.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('data-master')
export class DataMasterController {
  constructor(private readonly dataMasterService: DataMasterService) {}

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
}
