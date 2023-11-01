import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TukangServiceService } from './tukang_service.service';
import { CreateTukangServiceDto } from './dto/create-tukang_service.dto';
import { UpdateTukangServiceDto } from './dto/update-tukang_service.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tukang-service')
export class TukangServiceController {
  constructor(private readonly tukangServiceService: TukangServiceService) {}

  @Post('/')
  create(@Body() createTukangServiceDto: CreateTukangServiceDto, @Req() req) {
    const user_id = req.user.id;
    return this.tukangServiceService.create(createTukangServiceDto, user_id);
  }

  @Get('/')
  findAll() {
    return this.tukangServiceService.findAll();
  }

  @Get('/id')
  findOne(@Param('id') id: string) {
    return this.tukangServiceService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateTukangServiceDto: UpdateTukangServiceDto,
    @Req() req,
  ) {
    const user_id = req.user.id;
    return this.tukangServiceService.update(
      +id,
      updateTukangServiceDto,
      user_id,
    );
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Req() req) {
    const user_id = req.user.id;
    return this.tukangServiceService.remove(+id, user_id);
  }
}
