import { Body, Controller, Get, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { TransformPasswordPipe } from './transform-password.pipe';


@Controller('auth')
export class AuthController {

  /**
   * Constructor
   * @param authService 
   */
  constructor(private authService: AuthService) {

  }

  /**
   * Register controller
   * @param dto 
   * @returns 
   */
  @UsePipes(ValidationPipe, TransformPasswordPipe)
  @HttpCode(200)
  @Post('register')
  async register(@Body() dto: CreateRegisterDto) {
    return await this.authService.register(dto);
  }

  /**
   * Login Controller
   * @param dto 
   * @returns 
   */
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: CreateLoginDto) {
    return await this.authService.login(dto);
  }
}