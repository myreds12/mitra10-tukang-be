import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

import { Response as IExpressResponse } from 'express';

import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
@ApiTags('Stores')
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('/export-excel')
  @UseGuards()
  async memberExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    const data = await this.storeService.storeExportExcel(res, query);
    return data;
  }

  @Get('next-code')
  @HttpCode(200)
  async getCode() {
    const code = await this.storeService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return {
      code: nextCode,
    };
  }

  @Post('/')
  async create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    const user_id = req.user.id;

    return await this.storeService.create(createStoreDto, user_id);
  }

  @Get('/')
  @HttpCode(200)
  async findAll(@Query() query: QueryParamsDto) {
    return await this.storeService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return await this.storeService.findOne(+id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return await this.storeService.update(+id, updateStoreDto, user_id);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return await this.storeService.remove(+id, user_id);
  }
}
