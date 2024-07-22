import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  Res,
  Query,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { SalesService } from './sales.service';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { sales, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('/export-excel')
  @UseGuards()
  async salesExportExcel(@Query() query: QueryParamsDto, @Res() res: Response) {
    console.log(query.store_id);
    // if (!query.store_id?.length) {
    //   throw new BadRequestException(
    //     'Anda harus memilih Store terlebih dahulu.',
    //   );
    // }

    return await this.salesService.salesExportExcel(res, query);
    }
    
    @Post('/upload-excel')
    @UseInterceptors(
      FileInterceptor('file', {
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, cb) => {
            const filename = `${Date.now()}-${file.originalname}`;
            cb(null, filename);
          },
        }),
      }),
    )
    async uploadTemplate(@UploadedFile() file: Express.Multer.File, @Res() res: Response, @Req() req: UserRequest) {
      try {
        const result = await this.salesService.syncSalesCommission(file.path, req.user);
        return res.status(200).json({ statusCode: 200 ,message: "Successfully Update Comission", data: result });
      } catch (error) {
        console.error('Error uploading and processing Excel file:', error);
        throw error
      }
    }

  @Get('/export-excel-template')
  @UseGuards()
  async salesExportTemplateExcel(@Res() res: Response, @Query() query: QueryParamsDto) {
    return await this.salesService.templateDefaultExcel(res, query);
  }

  @Get('next-code')
  async getCode() {
    const code = await this.salesService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @Post('/salesUser/:store_id')
  async salesUser(@Param('store_id') store_id: number) {
    return await this.salesService.salesUser(store_id);
  }

  @Post()
  async create(
    @Body() createSaleDto: CreateSalesDto,
    @Request() req: RequestWithUser,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.create(createSaleDto, user);
  }

  @Get()
  async findAll(
    @Query() query: QueryParamsDto,
  ): Promise<{ data: sales[]; meta?: any }> {
    return await this.salesService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number): Promise<sales> {
    return await this.salesService.findOne(id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateSaleDto: UpdateSalesDto,
    @Request() req: RequestWithUser,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.update(id, updateSaleDto, user);
  }

  @Delete('/:id')
  async remove(@Param('id') id: number, @Request() req: RequestWithUser) {
    const user = req.user;
    return await this.salesService.remove(id, user);
  }
}
