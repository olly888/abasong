import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { SearchService } from "./search.service";
@Controller("v1/search/addresses")
@UseGuards(IdentityGuard)
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}
  private actor(r: ApiRequest) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (Object.keys(r.query).length || !r.is("application/json"))
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交搜索内容");
    return r.identity;
  }
  @Post("suggest") @HttpCode(200) suggest(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.service.suggest(this.actor(r), b);
  }
  @Post("retrieve") @HttpCode(200) retrieve(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.service.retrieve(this.actor(r), b);
  }
}
