import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import { ApiError } from "../common/api-error";
import type { ApiRequest } from "../common/request-context";
import { DriversService } from "./drivers.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class DriversController {
  constructor(
    @Inject(DriversService) private readonly service: DriversService,
  ) {}
  private actor(r: ApiRequest, list = false, write = false) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      (!list && Object.keys(r.query).length) ||
      (write && !r.is("application/json"))
    )
      throw new ApiError(400, "INVALID_INPUT", "请检查提交信息");
    return r.identity;
  }
  @Get("me/availability") mine(@Req() r: ApiRequest) {
    return this.service.mine(this.actor(r));
  }
  @Put("me/availability") set(@Req() r: ApiRequest, @Body() b: unknown) {
    return this.service.set(this.actor(r, false, true), b);
  }
  @Get("drivers") list(@Req() r: ApiRequest) {
    return this.service.list(this.actor(r, true), r.query);
  }
  @Get("drivers/:id") get(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.service.get(this.actor(r), id);
  }
}
