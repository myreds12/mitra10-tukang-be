import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtConfig } from 'src/jwt.config';
import { JwtStrategy } from './jwt.strategy';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
      property: 'user',
      session: false,
    }),
    JwtModule.register({
      secret: JwtConfig.user_secret,
      signOptions: {
        expiresIn: JwtConfig.user_expired,
      },
    }),
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/profile-picture',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
