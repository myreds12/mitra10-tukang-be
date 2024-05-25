import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Brands')
@UseGuards(JwtAuthGuard)
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post('/')
  async create(
    @Body() createBrandDto: CreateBrandDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return await this.brandsService.create(createBrandDto, user);
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.brandsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return await this.brandsService.findOne(id);
  }

  @Post(':id')
  async update(
    @Param('id') id: number,
    @Body() updateBrandDto: UpdateBrandDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return await this.brandsService.update(id, updateBrandDto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: number, @Req() req: RequestWithUser) {
    const user = req.user;
    return await this.brandsService.remove(id, user);
  }
}
