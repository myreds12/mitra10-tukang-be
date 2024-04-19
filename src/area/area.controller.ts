import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res } from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Http } from 'winston/lib/winston/transports';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';

@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post()
  async create(@Body() createAreaDto: CreateAreaDto) {
    try{
      const area = this.areaService.create(createAreaDto); 
      return {
        status: HttpStatus.CREATED,
        message: 'CREATED',
        data: area
      }
    }catch(error){
      return{
        message: error.message
      }
    }
  }

  @Get('/')
  async findAll(
    @Res() response: IExpressResponse,
  ) {
    try {

      const data = await this.areaService.findAll();

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Item',
        data
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.areaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAreaDto: UpdateAreaDto) {
    return this.areaService.update(+id, updateAreaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.areaService.remove(+id);
  }
}
