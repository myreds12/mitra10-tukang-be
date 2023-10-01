import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UseGuards, UploadedFile, Request, Res, HttpStatus, Query } from '@nestjs/common';
import { ComplaintEvidenceService } from './complaint-evidence.service';
import { CreateComplaintEvidenceDto } from './dto/create-complaint-evidence.dto';
import { UpdateComplaintEvidenceDto } from './dto/update-complaint-evidence.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { response } from 'express';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Controller('complaint-evidence')
export class ComplaintEvidenceController {
  constructor(private readonly complaintEvidenceService: ComplaintEvidenceService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('complaint_file', {
      storage: diskStorage({
        destination: './uploads/complaint',
        filename(req, file, callback) {
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async create(@UploadedFile() complaint_file: Express.Multer.File, @Body() createComplaintEvidenceDto: CreateComplaintEvidenceDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_evidence = await this.complaintEvidenceService.create(createComplaintEvidenceDto, user_id, complaint_file);
      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Complaint Evidence Create',
        data: complaint_evidence
      })
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }
  }

  @Get()
  async findAll(@Res() response) {
    try {
      const complaint_evidence = await this.complaintEvidenceService.findAll();
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Complaint Evidence',
        data: complaint_evidence
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const complaint_evidence = await this.complaintEvidenceService.findOne(+id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Complaint Evidence',
        data: complaint_evidence
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error
      })
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateComplaintEvidenceDto: UpdateComplaintEvidenceDto, @UploadedFile() complaint_file: Express.Multer.File, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_evidence = await this.complaintEvidenceService.update(+id, updateComplaintEvidenceDto, complaint_file, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint Evidence Update',
        data: complaint_evidence
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error
      })
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_evidence = await this.complaintEvidenceService.remove(+id, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint Evidence Delete',
        data: complaint_evidence
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error
      })
    }
  }
}
