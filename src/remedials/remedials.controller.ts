import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFiles,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { RemedialsService } from './remedials.service';
import { CreateRemedialDto } from './dto/create-remedial.dto';
import { UpdateRemedialDto } from './dto/update-remedial.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@UseGuards(JwtAuthGuard)
@Controller('remedials')
export class RemedialsController {
  constructor(private readonly remedialsService: RemedialsService) { }

  @Post('/')
  @UseInterceptors(FilesInterceptor('remedial_evidences'))
  async create(
    @UploadedFiles() remedial_evidences: Array<Express.Multer.File>,
    @Body() createRemedialDto: CreateRemedialDto,
    @Request() req: RequestWithUser,
  ) {
    return await this.remedialsService.create(
      remedial_evidences,
      createRemedialDto,
      req.user,
    );
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.remedialsService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return await this.remedialsService.findOne(+id);
  }

  @Post('/:id')
  @UseInterceptors(
    FilesInterceptor('remedial_evidences', 20, {
      // ✅ Maksimal 20 file
      storage: diskStorage({
        destination: resolveUploadPath('remedials'),
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // ✅ Maksimal 10MB per file
      },
      fileFilter: (req, file, cb) => {
        // ✅ Hanya terima gambar
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(new Error('Hanya file gambar yang diperbolehkan'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @UploadedFiles() remedial_evidence: Express.Multer.File[],
    @Body() updateRemedialDto: UpdateRemedialDto,
    @Request() req: RequestWithUser,
  ) {
    return await this.remedialsService.update(
      +id,
      remedial_evidence,
      updateRemedialDto,
      req.user,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.remedialsService.remove(+id);
  }
}
