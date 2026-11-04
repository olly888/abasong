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
import { ImportsService } from "./imports.service";
@Controller("v1/me")
@UseGuards(IdentityGuard)
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly service: ImportsService,
  ) {}
  private actor(r: ApiRequest, write = false, query = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      (!query && Object.keys(r.query).length) ||
      (write && !r.is("application/json"))
    )
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交资料");
    return r.identity;
  }
  @Get("import-policy") policy(@Req() r: ApiRequest) {
    return this.service.policy(this.actor(r));
  }
  @Get("import-batches") list(@Req() r: ApiRequest) {
    return this.service.list(this.actor(r, false, true), r.query);
  }
  @Post("import-batches") create(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.create(this.actor(r, true), b, k);
  }
  @Get("import-batches/:bid") detail(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
  ) {
    return this.service.detail(this.actor(r), bid);
  }
  @Patch("import-batches/:bid") mode(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.changeMode(this.actor(r, true), bid, b, k);
  }
  @Delete("import-batches/:bid") remove(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.remove(this.actor(r, true), bid, b, k);
  }
  @Get("import-batches/:bid/sources") sources(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
  ) {
    return this.service.sources(this.actor(r, false, true), bid, r.query);
  }
  @Post("import-batches/:bid/sources/local") register(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.register(this.actor(r, true), bid, b, k);
  }
  @Post("import-batches/:bid/sources/:sid/extractions") extract(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Param("sid") sid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.extract(this.actor(r, true), bid, sid, b, k);
  }
  @Get("import-batches/:bid/candidates") candidates(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
  ) {
    return this.service.candidates(this.actor(r, false, true), bid, r.query);
  }
  @Patch("import-batches/:bid/candidates/:cid") edit(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Param("cid") cid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.edit(this.actor(r, true), bid, cid, b, k);
  }
  @Post("import-batches/:bid/candidates/confirm") @HttpCode(200) confirm(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.confirm(this.actor(r, true), bid, b, k);
  }
  @Post("import-batches/:bid/candidates/:cid/confirm")
  @HttpCode(200)
  confirmOne(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Param("cid") cid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.confirmOne(this.actor(r, true), bid, cid, b, k);
  }
  @Post("import-batches/:bid/commit") @HttpCode(200) commit(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.commit(this.actor(r, true), bid, b, k);
  }
  @Post("import-batches/:bid/cancel") @HttpCode(200) cancel(
    @Req() r: ApiRequest,
    @Param("bid") bid: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.cancel(this.actor(r, true), bid, b, k);
  }
}
