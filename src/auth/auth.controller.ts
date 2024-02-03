import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
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

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private sendEmailService: SendEmailService) { }

  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: CreateLoginDto) {
    return await this.authService.login(dto);
  }
  @HttpCode(201)
  @Post('update-password/:username')
  async updatePassword(@Param('username') username: string, @Body() dto: ResetPasswordDto) {
    return await this.authService.updatePassword(username, dto);
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
}
