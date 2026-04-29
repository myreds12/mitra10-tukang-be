import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

export class JwtAuthGuard extends AuthGuard('jwt-user') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Sesi Anda telah berakhir, silahkan login kembali.',
        )
      );
    }
    return user;
  }
}
