import { ExceptionFilter, Catch, ArgumentsHost, NotFoundException, HttpException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    
    const errorResponse = {
      statusCode: status,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: ctx.getRequest().url,
    };

    response.status(status).json(errorResponse);
  }
}
