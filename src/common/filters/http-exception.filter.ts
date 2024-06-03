import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const ctxResponse = ctx.getResponse();
    const ctxRequest = ctx.getRequest();
    const exStatus = exception.getStatus();
    const exResponse = exception.getResponse();

    const err: {
      statusCode: string | number;
      message: string | object;
      timestamp: string;
      path: string | object;
    } = {
      statusCode: exStatus,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: ctxRequest.url,
    };

    if (
      exception instanceof BadRequestException &&
      typeof exResponse === 'object'
    ) {
      err['message'] = (exResponse as { message: string }).message;
    }

    if (process.env.NODE_ENV !== 'production') {
      err['stack'] = exception.stack.split('\n').map((line) => line.trim());
    }

    ctxResponse.status(exStatus).json(err);
  }
}
