import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Handle unique constraint violation as 409 conflict
    let status = 500;
    switch (exception.code) {
      case 'P2025':
        status = 404;
        break;
      case 'P2002':
        status = 409;
        break;
      default:
        status = 500;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception?.meta ?? exception.message,
      code: exception.code,
    };

    if (process.env.NODE_ENV !== 'production') {
      errorResponse['stack'] = exception.stack
        .split('\n')
        .map((line) => line.trim());
    }

    response.status(status).json(errorResponse);
  }
}
