import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IdentityGuard } from "../auth/identity.guard";
import type { ApiRequest } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { DevicesService } from "./devices.service";
function validate(r: ApiRequest, write = false) {
  if (Object.keys(r.query).length || (write && !r.is("application/json")))
    throw new ApiError(400, "INVALID_INPUT", "请以JSON提交，不附加查询字段");
}
@Controller("v1")
@UseGuards(IdentityGuard)
export class DevicesController {
  constructor(
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}
  private actor(r: ApiRequest, write = false) {
    validate(r, write);
    if (!r.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    return r.identity;
  }
  @Post("me/devices") device(
    @Req() r: ApiRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: unknown,
  ) {
    return this.devices.register(this.actor(r, true), b, k);
  }
  @Delete("me/devices/:id") unbind(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.devices.unbind(this.actor(r), id);
  }
}
@Controller("v1/device-installations")
export class InstallationRevocationController {
  constructor(
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}
  @Post("revoke") @HttpCode(200) revoke(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    validate(r, true);
    return this.devices.revokeInstallation(b);
  }
}
