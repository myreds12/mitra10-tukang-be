import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
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

interface UserRequest extends IExpressRequest {
  user: users;
}
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UsePipes(ValidationPipe, TransformPasswordPipe)
  @HttpCode(200)
  @Post('register')
  async register(@Body() dto: CreateRegisterDto) {
    return await this.authService.register(dto);
  }

  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: CreateLoginDto) {
    return await this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('permission')
  async getUserPermission(@Req() req: UserRequest) {
    return this.authService.getUserPermission(req.user);
  }
}
