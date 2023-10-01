import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  Res,
  UseGuards,
  HttpStatus,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@UseGuards(JwtAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('complaint_evidences', 5, {
      storage: diskStorage({
        destination: './uploads/complaints',
        filename(req, file, callback) {
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async create(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Body() createComplaintDto: CreateComplaintDto,
    @Request() req,
    @Res() response,
  ) {
    try {
      const user_id = req.user.id;
      const complaint = await this.complaintsService.create(
        createComplaintDto,
        user_id,
        complaint_evidences,
      );
      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Complaint Created',
        data: complaint,
      });
    } catch (error) {
      console.error(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() response) {
    try {
      const complaint = await this.complaintsService.findAll(query);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Complaint',
        data: complaint,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() response) {
    try {
      const complaint = await this.complaintsService.findOne(+id);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Complaint',
        data: complaint,
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @Request() req,
    @Res() response,
  ) {
    try {
      const user_id = req.user.id;
      const complaint = await this.complaintsService.update(
        +id,
        updateComplaintDto,
        user_id,
      );
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint Updated',
        data: complaint,
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id;
      const complaint = this.complaintsService.remove(+id, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint Deleted',
        data: complaint,
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error,
      });
    }
  }
}
