import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Res, UseInterceptors, UploadedFiles, HttpStatus, Query } from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse
} from 'express';
import { RemedialsService } from './remedials.service';
import { CreateRemedialDto } from './dto/create-remedial.dto';
import { UpdateRemedialDto } from './dto/update-remedial.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { users } from '@prisma/client';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('remedials')
export class RemedialsController {
  constructor(private readonly remedialsService: RemedialsService) { }

  @Post()
  @UseInterceptors(FilesInterceptor('remedial_evidences', 5))
  async create(@UploadedFiles() remedial_evidences: Express.Multer.File[], @Body() createRemedialDto: CreateRemedialDto, @Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const remedial = await this.remedialsService.create(remedial_evidences, createRemedialDto, req.user);

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Remedial Created',
        data: remedial
      })
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const remedial = await this.remedialsService.findAll(query)

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Remedials',
        data: remedial
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: IExpressResponse) {
    try {
      const remedial = await this.remedialsService.findOne(+id)

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Remedials',
        data: remedial
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error
      })
    }
  }

  @Post(':id')
  @UseInterceptors(
    FileInterceptor('remedial_evidence', {
      storage: diskStorage({
        destination: './uploads/remedial',
        filename: (req, file, callback) => {
          const uniqueSuffix = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async update(@Param('id') id: string, @UploadedFiles() remedial_evidence: Express.Multer.File[], @Body() updateRemedialDto: UpdateRemedialDto, @Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const remedial = await this.remedialsService.update(+id, remedial_evidence, updateRemedialDto, req.user);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Remedial Updated',
        data: remedial
      })
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.remedialsService.remove(+id)
  }
}
