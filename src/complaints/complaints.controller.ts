import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { users } from '@prisma/client';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post('/')
  @UseInterceptors(FilesInterceptor('complaint_evidences'))
  async create(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Body() createComplaintDto: CreateComplaintDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user_id = req.user.id;
      const complaint = await this.complaintsService.create(
        createComplaintDto,
        user_id,
        complaint_evidences,
      );
      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Complaint Created',
        data: complaint,
      });
    } catch (error) {
      console.error(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get('/')
  async findAll(
    @Query() query: QueryParamsDto,
    @Res() response: IExpressResponse,
  ) {
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

  @Post(':id')
  @UseInterceptors(FilesInterceptor('complaint_evidences'))
  async update(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user_id = req.user.id;
      const complaint = await this.complaintsService.update(
        +id,
        updateComplaintDto,
        user_id,
        complaint_evidences,
      );
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint Updated',
        data: complaint,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error While Update',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req, @Res() response) {
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
