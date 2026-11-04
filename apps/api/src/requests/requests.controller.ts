import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { RequestsService } from "./requests.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class RequestsController {
  constructor(
    @Inject(RequestsService) private readonly service: RequestsService,
  ) {}
  private actor(r: ApiRequest, write = false, query = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      (!query && Object.keys(r.query).length) ||
      (write && !r.is("application/json"))
    )
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交需求信息");
    return r.identity;
  }
  @Get("regions") regions(@Req() r: ApiRequest) {
    return this.service.regions(this.actor(r, false, true), r.query);
  }
  @Get("requests") list(@Req() r: ApiRequest) {
    return this.service.list(this.actor(r, false, true), r.query);
  }
  @Get("me/requests") mine(@Req() r: ApiRequest) {
    return this.service.list(this.actor(r, false, true), r.query, true);
  }
  @Get("requests/:id") get(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.service.get(this.actor(r), id);
  }
  @Post("requests") create(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.create(this.actor(r, true), b, k);
  }
  @Patch("requests/:id") patch(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.patch(this.actor(r, true), id, b);
  }
  @Delete("requests/:id") discard(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.discard(this.actor(r), id);
  }
  @Post("requests/:id/publish") @HttpCode(200) publish(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.publish(this.actor(r, true), id, b, k);
  }
  @Post("requests/:id/close") @HttpCode(200) close(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.close(this.actor(r, true), id, b, k);
  }
}
