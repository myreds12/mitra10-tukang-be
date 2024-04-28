import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  Res,
  HttpStatus,
  Query,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { TukangService } from './tukang.service';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { users } from '@prisma/client';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';

interface UserRequest extends IExpressRequest {
  user: users;
}

@ApiTags('Tukang')
@Controller('tukang')
@UseGuards(JwtAuthGuard)
export class TukangController {
  constructor(private readonly tukangService: TukangService) {}

  @Get('next-code')
  async getCode(@Request() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const code = await this.tukangService.getCode();
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

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'tukang_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
    ]),
  )
  async create(
    @Body() createTukangDto: CreateTukangDto,
    @Request() req: UserRequest,
    @UploadedFiles() files: TukangFiles,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;

      // Cek di dTO ada updateTukangDto?.service_types
      // if (!createTukangDto.service_types)
      //   throw new BadRequestException('Service type cannot be null.');
      // if (!createTukangDto.service_types.length)
      //   throw new BadRequestException('Service type should be an one or many.');

      const { tukang, userData } = await this.tukangService.create(
        createTukangDto,
        user,
        files,
      );

      return res.status(200).json({
        status: HttpStatus.CREATED,
        message: 'Tukang Created',
        data: tukang,
        user: userData,
      });
    } catch (error) {
      console.log(error);
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const { data, countTotal, page, skip, take } =
        await this.tukangService.findAll(query);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Data',
        data,
        total: countTotal,
        page,
        skip,
        take,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get('/:id')
  async findOne(@Param('id') id: number, @Res() res: IExpressResponse) {
    try {
      const tukang = await this.tukangService.findOne(id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Data',
        data: tukang,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Post('/:id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vendor_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
    ]),
  )
  async update(
    @Param('id') id: number,
    @Body() updateTukangDto: UpdateTukangDto,
    @Request() req: UserRequest,
    @UploadedFiles() files?: TukangFiles,
    // @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;

      // Cek di dTO ada updateTukangDto?.service_types
      if (!updateTukangDto.service_types)
        throw new BadRequestException('Service type cannot be null.');
      if (!updateTukangDto.service_types.length)
        throw new BadRequestException('Service type should be an one or many.');

      const tukang = await this.tukangService.update(
        id,
        updateTukangDto,
        user,
        files,
      );

      return {
        status: HttpStatus.OK,
        message: 'Tukang Updated',
        data: tukang,
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error,
      };
    }
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.tukangService.remove(+id, user_id);
  }
}
