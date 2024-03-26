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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { TransformPasswordPipe } from './transform-password.pipe';
import { users } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendEmailService } from 'src/mails/send-email.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private sendEmailService: SendEmailService) { }

  @Get('/get')
  async findAll(@Res() res: IExpressResponse, @Query() query: QueryParamsDto) {
    try {
      const resetPassword = await this.authService.findAll(query);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: resetPassword
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error',
        stack: error
      });
    }
  }

  @Get('/find-user/:id')
  async findOne(@Param('id', ParseIntPipe) id:number, @Res() res: IExpressResponse) {
    try {
      const resetPassword = await this.authService.findOne(id);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: resetPassword
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error ',
        stack: error
      });
    }
  }

  @Delete('/delete-user/:id')
  async delete(@Param('id', ParseIntPipe) id:number, @Res() res: IExpressResponse) {
    try {
      const resetPassword = await this.authService.deleteUser(id);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: resetPassword
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error ',
        stack: error
      });
    }
  }

  @Post('/update/:id')
  async update(@Param('id', ParseIntPipe) id:number, @Res() res: IExpressResponse, @Body() registerDto: CreateRegisterDto) {
    try {
      const resetPassword = await this.authService.updateUser(id, registerDto);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: resetPassword
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error ',
        stack: error
      });
    }
  }

  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: CreateLoginDto) {
    return await this.authService.login(dto);
  }
  @HttpCode(201)
  @Post('update-password/:username')
  async updatePassword(@Param('username') username: string, @Body() dto: ResetPasswordDto, @Res() res: IExpressResponse) {
    try {
      const users = await this.authService.updatePassword(username, dto);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: users
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error While Check Username',
        stack: error
      });
    } 
  }

  @HttpCode(201)
  @Post('reset-password')
  async resetPassword(@Body() body: { username: string }, @Res() res: IExpressResponse) {
    try {
      const { username } = body;
      const resetPassword = await this.authService.resetPassword(username);
      await this.sendEmailService.sendMailResetPassword(resetPassword.id);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Please Cek Your Email',
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error While Check Username',
        stack: error
      });
    }
  }
  @UseGuards(JwtAuthGuard)
  @Get('permission')
  async getUserPermission(@Req() req: UserRequest) {
    return this.authService.getUserPermission(req.user);
  }

  @HttpCode(201)
  @Get('/get-user/:username')
  async getUsers(@Param('username') username:string, @Res() res: IExpressResponse) {
    try {
      const resetPassword = await this.authService.getUsers(username);
      return res.status(201).json({
        status: HttpStatus.OK,
        message: 'Success',
        data: resetPassword
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message ?? 'Error ',
        stack: error
      });
    }
  }

 
}
