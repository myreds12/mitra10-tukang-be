import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtConfig } from 'src/jwt.config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';
import { BullModule } from '@nestjs/bull';

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
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtService,
    PrismaService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
