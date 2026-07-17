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
  ParseIntPipe,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { users } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

interface UserRequest extends IExpressRequest {
  user: users;
}

@ApiTags('Complaints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) { }

  @Get('/export-excel')
  @ApiOperation({
    summary: 'Export Complaints to Excel',
    description: 'Export filtered complaints to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async complaintExportExcel(
    @Res() res: IExpressResponse,
    @Query() query: QueryParamsDto,
  ) {
    return await this.complaintsService.complaintExportExcel(res, query);
  }

  @Get('next-code')
  @ApiOperation({
    summary: 'Get Next Complaint Code',
    description: 'Get the next available complaint code/number',
  })
  @ApiResponse({ status: 200, description: 'Next code retrieved' })
  async getCode() {
    try {
      const code = await this.complaintsService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;
      return { code: nextCode };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post(':id/set-status/:status_id')
  @ApiOperation({
    summary: 'Set Complaint Status',
    description: 'Update complaint status. Triggers customer complaint violation detection.',
  })
  @ApiParam({ name: 'id', description: 'Complaint ID', type: Number })
  @ApiParam({ name: 'status_id', description: 'New Status ID', type: Number })
  @ApiResponse({ status: 200, description: 'Complaint status updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Complaint or Status not found' })
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status_id', ParseIntPipe) status_id: number,
    @Body() payload: { reason?: string },
  ) {
    return await this.complaintsService.setStatus(id, status_id, payload);
  }

  @Post('/')
  @ApiOperation({
    summary: 'Create New Complaint',
    description: 'Create a new complaint with evidence files. Triggers customer complaint violation for the vendor.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Complaint created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('complaint_evidences'))
  async create(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Body() createComplaintDto: CreateComplaintDto,
    @Req() req: UserRequest,
  ) {
    const user = req.user;
    return await this.complaintsService.create(createComplaintDto, user, complaint_evidences);
  }

  @Get('/')
  @ApiOperation({
    summary: 'Get All Complaints',
    description: 'Retrieve paginated list of all complaints with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved complaints' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() query: QueryParamsDto) {
    return await this.complaintsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Complaint by ID',
    description: 'Retrieve a specific complaint by its ID with full details',
  })
  @ApiParam({ name: 'id', description: 'Complaint ID', type: String })
  @ApiResponse({ status: 200, description: 'Successfully retrieved complaint' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Complaint not found' })
  async findOne(@Param('id') id: string) {
    return await this.complaintsService.findOne(+id);
  }

  @Post(':id')
  @ApiOperation({
    summary: 'Update Complaint',
    description: 'Update an existing complaint with new data and/or evidence files (max 20 files, 10MB each)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Complaint ID to update', type: String })
  @ApiResponse({ status: 200, description: 'Complaint updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Complaint not found' })
  @UseInterceptors(
    FilesInterceptor('complaint_evidences', 20, {
      storage: diskStorage({
        destination: resolveUploadPath('complaints'),
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(new Error('Hanya file gambar yang diperbolehkan'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async update(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @Req() req: UserRequest,
  ) {
    const user = req.user;
    return await this.complaintsService.update(+id, updateComplaintDto, user, complaint_evidences);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Complaint',
    description: 'Delete a complaint by ID',
  })
  @ApiParam({ name: 'id', description: 'Complaint ID to delete', type: String })
  @ApiResponse({ status: 200, description: 'Complaint deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id') id: string, @Req() req: UserRequest) {
    const user_id = req.user.id;
    return await this.complaintsService.remove(+id, user_id);
  }
}
