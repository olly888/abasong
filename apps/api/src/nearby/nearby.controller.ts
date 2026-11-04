import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { NearbyService } from "./nearby.service";
@Controller("v1/apartments")
@UseGuards(IdentityGuard)
export class NearbyController {
  constructor(@Inject(NearbyService) private readonly service: NearbyService) {}
  private actor(r: ApiRequest) {
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (Object.keys(r.query).length || !r.is("application/json"))
      throw new ApiError(400, "INVALID_INPUT", "请以JSON提交");
    return r.identity;
  }
  @Post("discover") @HttpCode(200) discover(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.service.discover(this.actor(r), b);
  }
  @Post("discover/mapbox") @HttpCode(200) mapbox(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.service.discover(this.actor(r), b, true);
  }
  @Post("address-contributions") contribute(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string | undefined,
  ) {
    return this.service.contribute(this.actor(r), b, k);
  }
}
