import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseInterceptors,
  UseGuards,
  UploadedFile,
} from '@nestjs/common';
import { TukangService } from './tukang.service';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('tukang')
@UseGuards(JwtAuthGuard)
export class TukangController {
  constructor(private readonly tukangService: TukangService) {}

  @Post()
  create(
    @Body() createTukangDto: CreateTukangDto,
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    
    const user_id = req.user.id;
    return this.tukangService.create(createTukangDto, user_id, file);
  }

  @Get('/get')
  findAll() {
    return this.tukangService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.tukangService.findOne(+id);
  }

  @Post('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateTukangDto: UpdateTukangDto,
    @Request() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const user_id = req.user.id;
    if (file) {
      return this.tukangService.update(+id, updateTukangDto, user_id, file);
    } else {
      return this.tukangService.update(+id, updateTukangDto, user_id);
    }
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.tukangService.remove(+id, user_id);
  }
}
