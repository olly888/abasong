import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { RequestSharesService } from "./request-shares.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class RequestSharesController {
  constructor(
    @Inject(RequestSharesService)
    private readonly service: RequestSharesService,
  ) {}
  private actor(r: ApiRequest, write = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (Object.keys(r.query).length || (write && !r.is("application/json")))
      throw new ApiError(400, "INVALID_INPUT", "请检查分享信息");
    return r.identity;
  }
  @Post("requests/:id/share-links") create(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.create(this.actor(r, true), id, b, k);
  }
  @Delete("request-shares/:id") revoke(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.revoke(this.actor(r), id);
  }
  @Get("request-shares/:token/resolve") resolve(
    @Req() r: ApiRequest,
    @Param("token") token: string,
  ) {
    return this.service.resolve(this.actor(r), token);
  }
}
@Controller("v1/public/request-shares")
export class PublicRequestSharesController {
  constructor(
    @Inject(RequestSharesService)
    private readonly service: RequestSharesService,
  ) {}
  @Get(":token") get(@Req() r: ApiRequest, @Param("token") token: string) {
    if (Object.keys(r.query).length)
      throw new ApiError(400, "INVALID_INPUT", "请检查分享地址");
    return this.service.public(token);
  }
}
