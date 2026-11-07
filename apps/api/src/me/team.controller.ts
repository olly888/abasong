import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import { ApiError } from "../common/api-error";
import type { ApiRequest } from "../common/request-context";
import { TeamService } from "./team.service";
@Controller("v1")
@UseGuards(IdentityGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly teams: TeamService) {}
  private actor(req: ApiRequest) {
    if (Object.keys(req.query).length)
      throw new ApiError(400, "INVALID_INPUT", "不支持的查询字段");
    if (!req.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    return req.identity;
  }
  @Get("me/organization") own(@Req() r: ApiRequest) {
    return this.teams.get(this.actor(r), false);
  }
  @Get("me/organization/summary") summary(@Req() r: ApiRequest) {
    return this.teams.get(this.actor(r), true);
  }
  @Put("me/organization") update(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const a = this.actor(r);
    if (!r.is("application/json") || !r.requestId)
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交团队资料");
    return this.teams.update(a, b, key, r.requestId);
  }
  @Get("requests/:id/team") requestTeam(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.teams.detail(this.actor(r), "requests", id, false);
  }
  @Get("requests/:id/team/contact") requestContact(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.teams.detail(this.actor(r), "requests", id, true);
  }
  @Get("drivers/:id/team") driverTeam(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.teams.detail(this.actor(r), "drivers", id, false);
  }
  @Get("drivers/:id/team/contact") driverContact(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.teams.detail(this.actor(r), "drivers", id, true);
  }
}
