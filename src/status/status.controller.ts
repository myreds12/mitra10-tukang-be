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
import { StatusService } from './status.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Post()
  create(@Body() createStatusDto: CreateStatusDto, @Req() req) {
    const user_id = req.user.id;
    return this.statusService.create(createStatusDto, user_id);
  }

  @Get()
  findAll() {
    return this.statusService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.statusService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Req() req,
  ) {
    const user_id = req.user.id;
    return this.statusService.update(+id, updateStatusDto, user_id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    const user_id = req.user.id;
    return this.statusService.remove(+id, user_id);
  }
}
