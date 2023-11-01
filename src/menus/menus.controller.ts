import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UseGuards,
  Request,
  UploadedFile,
} from '@nestjs/common';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('menus')
@UseGuards(JwtAuthGuard)
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/file',
      filename: (req, file, callback) => {
        const uniqueSuffix = Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        const filename = `${uniqueSuffix}${ext}`;
        callback(null, filename);
      },
    }),
  }),
)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Post('/')
  create(
    @Body() createMenuDto: CreateMenuDto,
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user_id = req.user.id;
    return this.menusService.create(createMenuDto, user_id, file);
  }

  @Get('/')
  findAll() {
    return this.menusService.findAll();
  }

  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.menusService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateMenuDto: UpdateMenuDto,
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user_id = req.user.id;
    return this.menusService.update(+id, updateMenuDto, user_id, file);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.menusService.remove(+id, user_id);
  }
}
