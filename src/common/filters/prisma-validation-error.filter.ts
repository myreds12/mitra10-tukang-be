import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientValidationError)
export class PrismaValidationFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const module = this.getModuleFromRequest(request);
    const operation = this.getOperationFromRequest(request);

    const errorResponse = {
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: `Terjadi kesalahan dari sisi server, mohon hubungi Administrator. Code: ${500}. Module: ${module}_${operation}`,
      stack: exception.stack
    };

    response.status(500).json(errorResponse);
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
