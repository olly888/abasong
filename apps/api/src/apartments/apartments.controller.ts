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
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { ApartmentsService } from "./apartments.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class ApartmentsController {
  constructor(
    @Inject(ApartmentsService) private readonly service: ApartmentsService,
  ) {}
  private actor(r: ApiRequest, write = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (write && (Object.keys(r.query).length || !r.is("application/json")))
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交资料");
    return r.identity;
  }
  private noQuery(r: ApiRequest) {
    if (Object.keys(r.query).length)
      throw new ApiError(400, "INVALID_INPUT", "不支持的查询字段");
    return this.actor(r);
  }
  @Get("me/apartment-library") list(@Req() r: ApiRequest) {
    return this.service.list(this.actor(r), r.query);
  }
  @Post("me/apartment-library") create(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.create(this.actor(r, true), b, k);
  }
  @Get("me/apartment-library/:entry_id") detail(
    @Req() r: ApiRequest,
    @Param("entry_id") id: string,
  ) {
    return this.service.detail(this.noQuery(r), id);
  }
  @Patch("me/apartment-library/:entry_id") patch(
    @Req() r: ApiRequest,
    @Param("entry_id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.patch(this.actor(r, true), id, b, k);
  }
  @Delete("me/apartment-library/:entry_id") remove(
    @Req() r: ApiRequest,
    @Param("entry_id") id: string,
  ) {
    return this.service.remove(this.noQuery(r), id, "entry");
  }
  @Post("me/apartment-library/:entry_id/records") createRecord(
    @Req() r: ApiRequest,
    @Param("entry_id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.createRecord(this.actor(r, true), id, b, k);
  }
  @Patch("me/private-access-records/:private_record_id") patchRecord(
    @Req() r: ApiRequest,
    @Param("private_record_id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.patchRecord(this.actor(r, true), id, b, k);
  }
  @Delete("me/private-access-records/:private_record_id") removeRecord(
    @Req() r: ApiRequest,
    @Param("private_record_id") id: string,
  ) {
    return this.service.remove(this.noQuery(r), id, "record");
  }
  @Post("me/private-access-records/:private_record_id/share") share(
    @Req() r: ApiRequest,
    @Param("private_record_id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.sharePrivate(this.actor(r, true), id, b, k);
  }
  @Get("me/contributions") contributions(@Req() r: ApiRequest) {
    return this.service.contributions(this.actor(r), r.query);
  }
  @Post("apartments/resolve")
  @HttpCode(200)
  resolve(@Req() r: ApiRequest, @Body() b: unknown) {
    return this.service.resolve(this.actor(r, true), b);
  }
  @Get("apartments/:apartment_id") apartment(
    @Req() r: ApiRequest,
    @Param("apartment_id") id: string,
  ) {
    return this.service.apartment(this.noQuery(r), id);
  }
  @Get("apartments") search(@Req() r: ApiRequest) {
    return this.service.search(this.actor(r), r.query);
  }
  @Post("apartments/:apartment_id/access-records") contribute(
    @Req() r: ApiRequest,
    @Param("apartment_id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.contribute(this.actor(r, true), id, b, k);
  }
  @Get("apartments/:apartment_id/access-records") readShared(
    @Req() r: ApiRequest,
    @Param("apartment_id") id: string,
  ) {
    return this.service.readShared(this.actor(r), id, r.query);
  }
  @Put("access-records/:record_id/feedback") feedback(
    @Req() r: ApiRequest,
    @Param("record_id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.feedback(this.actor(r, true), id, b);
  }
}
