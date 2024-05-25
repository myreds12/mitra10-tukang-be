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
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { users } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';

interface UserRequest extends IExpressRequest {
  user: users;
}

@ApiTags('Complaints')
@UseGuards(JwtAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get('next-code')
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
  async setStatus(
    @Param('id') id: number,
    @Param('status_id') status_id: number,
    @Body() payload: { reason?: string },
  ) {
    return await this.complaintsService.setStatus(id, status_id, payload);
  }

  @Post('/')
  @UseInterceptors(FilesInterceptor('complaint_evidences'))
  async create(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Body() createComplaintDto: CreateComplaintDto,
    @Req() req: UserRequest,
  ) {
    const user = req.user;
    return await this.complaintsService.create(
      createComplaintDto,
      user,
      complaint_evidences,
    );
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.complaintsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.complaintsService.findOne(+id);
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('complaint_evidences'))
  async update(
    @UploadedFiles() complaint_evidences: Array<Express.Multer.File>,
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @Req() req: UserRequest,
  ) {
    const user = req.user;
    return await this.complaintsService.update(
      +id,
      updateComplaintDto,
      user,
      complaint_evidences,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: UserRequest) {
    const user_id = req.user.id;
    return await this.complaintsService.remove(+id, user_id);
  }
}
