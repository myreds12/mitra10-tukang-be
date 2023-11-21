import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post('/')
  create(@Body() createPositionDto: CreatePositionDto, @Request() req) {
    const user_id = req.user.id;
    return this.positionsService.create(createPositionDto, user_id);
  }

  @Get('/')
  findAll() {
    return this.positionsService.findAll();
  }

  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updatePositionDto: UpdatePositionDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.positionsService.update(+id, updatePositionDto, user_id);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.positionsService.remove(+id, user_id);
  }
}
