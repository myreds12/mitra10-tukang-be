import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post('/')
  async create(
    @Body() createBrandDto: CreateBrandDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const brands = await this.brandsService.create(createBrandDto, user);
      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Created',
        data: brands,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Create',
        stack: error,
      });
    }
  }

  @Get('/')
  async findAll(@Res() res: IExpressResponse) {
    try {
      const brands = await this.brandsService.findAll();
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Data',
        data: brands,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @Res() res: IExpressResponse) {
    try {
      const brands = await this.brandsService.findOne(id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Details Data',
        data: brands,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Get',
        stack: error,
      });
    }
  }

  @Post(':id')
  async update(
    @Param('id') id: number,
    @Body() updateBrandDto: UpdateBrandDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const brands = await this.brandsService.update(id, updateBrandDto, user);
      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Updated',
        data: brands,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Update',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: number,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const brands = await this.brandsService.remove(id, user);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Deleted',
        data: brands,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Delete',
        stack: error,
      });
    }
  }
}
