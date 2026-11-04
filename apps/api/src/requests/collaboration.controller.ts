import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { CollaborationService } from "./collaboration.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class CollaborationController {
  constructor(
    @Inject(CollaborationService)
    private readonly service: CollaborationService,
  ) {}
  private actor(r: ApiRequest, write = false, query = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      (!query && Object.keys(r.query).length) ||
      (write && !r.is("application/json"))
    )
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交");
    return r.identity;
  }
  @Post("requests/:id/applications") apply(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.apply(this.actor(r, true), id, b, k);
  }
  @Get("requests/:id/applications") applicants(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.applications(this.actor(r, false, true), r.query, id);
  }
  @Get("me/applications") mine(@Req() r: ApiRequest) {
    return this.service.applications(this.actor(r, false, true), r.query);
  }
  @Delete("applications/:id") withdraw(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.withdraw(this.actor(r), id);
  }
  @Put("applications/:id/contacted") contacted(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.contacted(this.actor(r), id);
  }
  @Post("conversations") conversation(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.service.createConversation(this.actor(r, true), b, k);
  }
  @Get("conversations/:id/messages") messages(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.service.messages(this.actor(r, false, true), id, r.query);
  }
  @Put("conversations/:id/read") read(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.read(this.actor(r, true), id, b);
  }
}
