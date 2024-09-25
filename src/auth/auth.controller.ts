import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  @Post('/update/training')
  @UseGuards(JwtAuthGuard)
  async updateUserTraining(
    @Query('take') take: number = 100
  ) {
    return await this.authService.updateAllUsersForTesting(take);
  }

  @Get('/get')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.authService.findAll(query);
  }

  @Get('/find-user/:id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.authService.findOne(id);
  }
  
  @Delete('/delete-user/:id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.authService.deleteUser(id);
  }

  @Post('/update/:id')
  @UseInterceptors(FileInterceptor('files'))
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @UploadedFile() files: Express.Multer.File,
  ) {
    return await this.authService.updateUser(id, dto, files);
  }



  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: CreateLoginDto) {
    return await this.authService.login(dto);
  }

  @HttpCode(200)
  @Post('register')
  async register(@Body() dto: CreateRegisterDto) {
    return await this.authService.register(dto);
  }
  @HttpCode(200)
  @Post('update-password/:username')
  async updatePassword(
    @Param('username') username: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return await this.authService.updatePassword(username, dto);
  }

  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() body: { username: string }) {
    const { username } = body;
    const resetPassword = await this.authService.resetPassword(username);
    this.emailQueue.add(
      'send-reset-password-mail',
      {
        user_id: resetPassword?.id,
      },
      {
        attempts: 3,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('permission')
  async getUserPermission(@Req() req: RequestWithUser) {
    return this.authService.getUserPermission(req.user);
  }

  @HttpCode(201)
  @Get('/get-user/:username')
  async getUsers(@Param('username') username: string) {
    return await this.authService.getUsers(username);
  }
}
