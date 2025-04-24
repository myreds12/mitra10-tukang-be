/* eslint-disable prettier/prettier */
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
  Query,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
} from 'express';
import { ManagerService } from './manager.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { manager, sales, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Manager')
@Controller('manager')
@UseGuards(JwtAuthGuard)
export class ManagerController {
  constructor(private readonly salesService: ManagerService) {}

  @Delete('/delete-manager-incentive/:id')
  async deleteSalesIncentive(@Param('id') id: number) {
    return await this.salesService.deleteSalesIncentive(id);
  }

  @Post('/sales-user-management/:range_date')
  async apiSalesUSerManagement(@Param('range_date') range_date: 7 | 4) {
    if(range_date !== 7 && range_date !== 4) throw new BadRequestException('Range date must be 7 or 4');
    return await this.salesService.apiManagementSales(range_date);
  }

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

  @Post('/incentive-update-date/:id')
  async incentiveUpdateDate(@Param('id') id: number) {
    return await this.salesService.updateDateSalesIncentive(id);
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
  async uploadTemplate(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
    @Req() req: UserRequest,
  ) {
    try {
      const result = await this.salesService.syncSalesCommission(
        file.path,
        req.user,
      );
      return res
        .status(200)
        .json({
          statusCode: 200,
          message: 'Successfully Update Comission',
          data: result,
        });
    } catch (error) {
      console.error('Error uploading and processing Excel file:', error);
      throw error;
    }
  }

  @Get('/export-excel-template')
  @UseGuards()
  async salesExportTemplateExcel(
    @Res() res: Response,
    @Query() query: QueryParamsDto,
  ) {
    return await this.salesService.templateDefaultExcel(res, query);
  }

  @Get('next-code')
  async getCode() {
    const code = await this.salesService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @Get('/managerUser/:store_id')
  async salesUser(@Param('store_id') store_id: number) {
    return await this.salesService.salesUser(store_id);
  }

  @Post()
  async create(
    @Body() createSaleDto: CreateManagerDto,
    @Request() req: RequestWithUser,
  ): Promise<any> {
    const user = req.user;
    return await this.salesService.create(createSaleDto, user);
  }

  @Post('/insentive-manager')
  async createInsetive(
    @Body() createSaleDto: any,
    @Request() req: RequestWithUser,
  ): Promise<any> {
    const user = req.user;
    return await this.salesService.createInsetivManager(createSaleDto, user);
  }

  @Get('/insentive-manager')
  async getInsetive(
    @Query() query: QueryParamsDto,
  ): Promise<any> {
    return await this.salesService.getInsentive(query);
  }

  @Get()
  async findAll(
    @Query() query: QueryParamsDto,
  ): Promise<{ data: any[]; meta?: any }> {
    return await this.salesService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number): Promise<manager> {
    return await this.salesService.findOne(id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateSaleDto: UpdateManagerDto,
    @Request() req: RequestWithUser,
  ): Promise<manager> {
    const user = req.user;
    return await this.salesService.update(id, updateSaleDto, user);
  }

  @Delete('/:id')
  async remove(@Param('id') id: number, @Request() req: RequestWithUser) {
    const user = req.user;
    return await this.salesService.remove(id, user);
  }
}
