import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
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

    const module = this.getModuleFromRequest(request);
    const operation = this.getOperationFromRequest(request);

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: status === 500
        ? `Terjadi kesalahan dari sisi server, mohon hubungi Administrator. Code: ${status}. Module: ${module}_${operation}`
        : exception.message,
      code: exception.code,
    };

    if (process.env.NODE_ENV !== 'production') {
      errorResponse['stack'] = exception.stack.split('\n').map((line) => line.trim());
    }

    response.status(status).json(errorResponse);
  }

  private getModuleFromRequest(request: any): string {
    const segments = request.url.split('/');
    return segments.length > 1 ? segments[1].toUpperCase() : 'UNKNOWN_MODULE';
  }

  private getOperationFromRequest(request: any): string {
    switch (request.method) {
      case 'POST':
        return 'INSERT';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return 'UNKNOWN_OPERATION';
    }
  }
}
