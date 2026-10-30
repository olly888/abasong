import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error';
import type { ApiRequest } from './request-context';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const req = context.getRequest<ApiRequest>(),
      res = context.getResponse<Response>();
    const requestId = req.requestId ?? randomUUID();
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = '服务暂不可用';
    if (error instanceof ApiError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (
      error instanceof Error &&
      (error as { type?: string }).type === 'entity.parse.failed'
    ) {
      status = 400;
      code = 'INVALID_INPUT';
      message = '请求内容有误';
    } else if (
      error instanceof Error &&
      (error as { type?: string }).type === 'entity.too.large'
    ) {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = '请求内容过大';
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      const errors: Record<number, [string, string]> = {
        400: ['INVALID_INPUT', '请求内容有误'],
        401: ['AUTH_REQUIRED', '请先登录'],
        403: ['FORBIDDEN', '无权访问'],
        404: ['NOT_FOUND', '内容不存在或不可见'],
        413: ['PAYLOAD_TOO_LARGE', '请求内容过大'],
        429: ['RATE_LIMITED', '请求过于频繁'],
        503: ['SERVICE_UNAVAILABLE', '服务暂不可用'],
      };
      [code, message] = errors[status] ?? ['INTERNAL_ERROR', '服务暂不可用'];
    }
    // Do not serialize provider errors, request bodies, JWTs, SQL or stack traces.
    res.setHeader('X-Request-ID', requestId);
    res.status(status).json({ code, message, request_id: requestId });
  }
}
