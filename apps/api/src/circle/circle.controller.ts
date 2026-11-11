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
import { ApiError } from "../common/api-error";
import type { ApiRequest } from "../common/request-context";
import { CircleService } from "./circle.service";

@Controller("v1")
@UseGuards(IdentityGuard)
export class CircleController {
  constructor(@Inject(CircleService) private readonly circle: CircleService) {}
  private actor(r: ApiRequest, acceptsQuery = false, json = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      (!acceptsQuery && Object.keys(r.query).length) ||
      (json && !r.is("application/json"))
    )
      throw new ApiError(400, "INVALID_INPUT", "请检查请求格式");
    return r.identity;
  }
  @Get("posts") posts(@Req() r: ApiRequest) {
    return this.circle.posts(this.actor(r, true), r.query, false);
  }
  @Get("me/posts") mine(@Req() r: ApiRequest) {
    return this.circle.posts(this.actor(r, true), r.query, true);
  }
  @Post("posts") create(
    @Req() r: ApiRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
  ) {
    return this.circle.create(this.actor(r, false, true), body, key);
  }
  @Get("posts/:id") get(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.circle.get(this.actor(r), id);
  }
  @Delete("posts/:id") removePost(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.circle.remove(this.actor(r), id, "post");
  }
  @Get("posts/:id/comments") comments(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.circle.comments(this.actor(r, true), id, r.query);
  }
  @Post("posts/:id/comments") reply(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
  ) {
    return this.circle.reply(this.actor(r, false, true), id, body, key);
  }
  @Delete("comments/:id") removeComment(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.circle.remove(this.actor(r), id, "comment");
  }
  @Post("reports") report(
    @Req() r: ApiRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
  ) {
    return this.circle.report(this.actor(r, false, true), body, key);
  }
  @Get("me/blocks") blockedUsers(@Req() r: ApiRequest) {
    return this.circle.blockedUsers(this.actor(r, true), r.query);
  }
  @Put("me/blocks/:id") block(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.circle.block(this.actor(r), id, true);
  }
  @Delete("me/blocks/:id") unblock(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.circle.block(this.actor(r), id, false);
  }
}
