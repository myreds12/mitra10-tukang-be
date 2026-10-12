import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from 'src/common/decorator/public.decorator';

export class JwtAuthGuard extends AuthGuard('jwt-user') {
  canActivate(context: ExecutionContext) {
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, context.getHandler()) ??
      Reflect.getMetadata(IS_PUBLIC_KEY, context.getClass());
    if (isPublic) {
      return true;
    }
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
