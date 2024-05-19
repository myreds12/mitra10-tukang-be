import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RescheduleService } from './reschedule.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateRescheduleDto } from './dto/create-reschedule.dto';
import { users } from '@prisma/client';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateRescheduleDto } from './dto/update-reschedule.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('reschedule')
export class RescheduleController {
  constructor(private readonly rescheduleService: RescheduleService) {}

  @Get('next-code')
  async getCode(@Req() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const code = await this.rescheduleService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Complaint code pulled',
        data: { code: nextCode },
      });
    } catch (error) {
      console.error(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While pulling complaint code',
        stack: error,
      });
    }
  }

  @UseInterceptors(FilesInterceptor('reschedule_evidences'))
  @Post()
  async create(
    @Body() rescheduleDto: CreateRescheduleDto,
    @Req() req: UserRequest,
    @UploadedFiles() reschedule_evidences: Express.Multer.File[],
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const reschedule = await this.rescheduleService.create(
        rescheduleDto,
        user,
        reschedule_evidences,
      );
      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Successfully',
        data: reschedule,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed',
        stack: error,
      });
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto ,@Res() res: IExpressResponse) {
    try{
      const reschedule = await this.rescheduleService.findAll(query);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: reschedule,
        total: reschedule.countTotal,
        takeTotal: reschedule.takeTotal,
        page: reschedule.page,
        take: reschedule.take,
      });
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed',
        stack: error,
      });
    }
  }

  @Get('/:id')
  async findOne(@Param('id', ParseIntPipe) id: number,@Res() res: IExpressResponse){
    try{
      const reschedule = await this.rescheduleService.findOne(id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: reschedule,
      });
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed',
        stack: error,
      });
    }
  }
  

  @UseInterceptors(FilesInterceptor('reschedule_evidences'))
  @Post('/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() rescheduleDto: UpdateRescheduleDto,
    @Req() req: UserRequest,
    @UploadedFiles() reschedule_evidences: Express.Multer.File[],
    @Res() res: IExpressResponse,
  ) {
    console.log(rescheduleDto);
    try {
      
      const user = req.user;
      const reschedule = await this.rescheduleService.update(
        id,
        rescheduleDto,
        user,
        reschedule_evidences,
      );
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: reschedule,
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed',
        stack: error,
      });
    }
  }
}
