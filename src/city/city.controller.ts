import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, Query, Res, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CityService } from './city.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import {
  Response as IExpressResponse,
} from 'express';


@UseGuards(JwtAuthGuard)
@Controller('city')
export class CityController {
  constructor(private readonly cityService: CityService) { }
  
  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse){
    try{
      const {data, countTotal, take, page} = await this.cityService.findAll(query);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get',
        data,
        total: countTotal,
        page,
        take
      })
    }catch(error){
       return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
       })
    }
  }
 
}
