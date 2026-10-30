import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { IdentityGuard } from '../auth/identity.guard';
import type { ApiRequest } from '../common/request-context';
import { ApiError } from '../common/api-error';
import { MeService } from './me.service';
@Controller('v1/me')
@UseGuards(IdentityGuard)
export class MeController {
  constructor(@Inject(MeService) private readonly service:MeService) {}
  @Get() get(@Req() req:ApiRequest) {
    if(Object.keys(req.query).length) throw new ApiError(400,'INVALID_INPUT','不支持的查询字段');
    if(!req.identity) throw new ApiError(401,'AUTH_REQUIRED','请先登录');
    return this.service.get(req.identity);
  }
  @Post('bootstrap') @HttpCode(200)
  bootstrap(@Req() req:ApiRequest,@Body() body:unknown,@Headers('idempotency-key') key:string|undefined) {
    if(Object.keys(req.query).length) throw new ApiError(400,'INVALID_INPUT','不支持的查询字段');
    if(!req.is('application/json')) throw new ApiError(400,'INVALID_INPUT','请以JSON提交资料');
    if(!req.identity||!req.requestId) throw new ApiError(401,'AUTH_REQUIRED','请先登录');
    return this.service.bootstrap(req.identity,body,key,req.requestId);
  }
}
