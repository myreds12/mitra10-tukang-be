import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, Query } from '@nestjs/common';
import { PromotionService } from './promotion.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { users } from '@prisma/client';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}
@UseGuards(JwtAuthGuard)
@Controller('promotion')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Post()
  async create(@Body() createPromotionDto: CreatePromotionDto, @Req() req: UserRequest) {
    return await this.promotionService.create(createPromotionDto, req.user);
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.promotionService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.promotionService.findOne(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updatePromotionDto: UpdatePromotionDto, @Req() req: UserRequest) {
    return await this.promotionService.update(+id, updatePromotionDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string,  @Req() req: UserRequest) {
    return await this.promotionService.remove(+id, req.user);
  }
}
