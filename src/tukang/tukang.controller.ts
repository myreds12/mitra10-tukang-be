import { Controller, Get, Post, Body, Patch, Param, Delete, UsePipes, Request, UseInterceptors, UploadedFiles, UseGuards, UploadedFile, ValidationPipe } from '@nestjs/common';
import { TukangService } from './tukang.service';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';



@Controller('tukang')
@UseGuards(JwtAuthGuard)
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/tukang',
      filename: (req, file, callback) => {
        const uniqueSuffix = Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        const filename = `${uniqueSuffix}${ext}`;
        callback(null, filename);
      },
    }),
  }),
)
export class TukangController {
  constructor(private readonly tukangService: TukangService) { }

  @Post('/create')
  create(@Body() createTukangDto: CreateTukangDto, @Request() req, @UploadedFile() file: Express.Multer.File) {
    console.log(file);

    const user_id = req.user.id
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

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateTukangDto: UpdateTukangDto, @Request() req, @UploadedFile() file?: Express.Multer.File) {
    const user_id = req.user.id
    if (file) {
      return this.tukangService.update(+id, updateTukangDto, user_id, file);
    } else {
      return this.tukangService.update(+id, updateTukangDto, user_id);
    }
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.tukangService.remove(+id, user_id);
  }
}
