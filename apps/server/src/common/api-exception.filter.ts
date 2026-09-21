import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { errorResponse } from './api-response';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof body?.message === 'string'
          ? body.message
          : '系统异常';
    response.status(status).json(errorResponse(message));
  }
}
