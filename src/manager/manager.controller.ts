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
} from '@nestjs/common';
import { Request as IExpressRequest } from 'express';
import { ManagerService } from './manager.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { manager, users } from '@prisma/client';
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
  constructor(private readonly managerService: ManagerService) {}

  @Delete('/delete-manager-incentive/:id')
  async deleteManagerIncentive(@Param('id') id: number) {
    return await this.managerService.deleteManagerIncentive(id);
  }

  @Get('/export-excel')
  @UseGuards()
  async managerExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: Response,
  ) {
    return await this.managerService.managerExportExcel(res, query);
  }

  @Post('/incentive-update-date/:id')
  async incentiveUpdateDate(@Param('id') id: number) {
    return await this.managerService.updateDateManagerIncentive(id);
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
      const result = await this.managerService.syncManagerCommission(
        file.path,
        req.user,
      );
      return res.status(200).json({
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
  async managerExportTemplateExcel(
    @Res() res: Response,
    @Query() query: QueryParamsDto,
  ) {
    return await this.managerService.templateDefaultExcel(res, query);
  }

  @Get('next-code')
  async getCode() {
    const code = await this.managerService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @Get('/managerUser/:store_id')
  async managerUser(@Param('store_id') store_id: number) {
    return await this.managerService.managerUser(store_id);
  }

  @Post()
  async create(
    @Body() createManagerDto: CreateManagerDto,
    @Request() req: RequestWithUser,
  ): Promise<any> {
    const user = req.user;
    return await this.managerService.create(createManagerDto, user);
  }

  @Post('/insentive-manager')
  async createInsetive(
    @Body() createManagerDto: any,
    @Request() req: RequestWithUser,
  ): Promise<any> {
    const user = req.user;
    return await this.managerService.createInsetiveManager(
      createManagerDto,
      user,
    );
  }

  @Get('/insentive-manager')
  async getInsetive(@Query() query: QueryParamsDto): Promise<any> {
    return await this.managerService.getInsentive(query);
  }
  @Get('/insentive-manager/:id')
  async findOneInsetif(@Param('id') id: number): Promise<any> {
    return await this.managerService.findOneInsetif(id);
  }

  @Get()
  async findAll(
    @Query() query: QueryParamsDto,
  ): Promise<{ data: any[]; meta?: any }> {
    return await this.managerService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number): Promise<manager> {
    return await this.managerService.findOne(id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateManagerDto: UpdateManagerDto,
    @Request() req: RequestWithUser,
  ): Promise<manager> {
    const user = req.user;
    return await this.managerService.update(id, updateManagerDto, user);
  }

  @Delete('/:id')
  async remove(@Param('id') id: number, @Request() req: RequestWithUser) {
    const user = req.user;
    return await this.managerService.remove(id, user);
  }
}
