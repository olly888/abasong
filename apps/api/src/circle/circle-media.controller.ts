import {
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IdentityGuard } from "../auth/identity.guard";
import { ApiError } from "../common/api-error";
import type { ApiRequest } from "../common/request-context";
import { requestId } from "../requests/request-input";
import { CircleMediaService, mediaBytesLimit } from "./circle-media";

let receiving = 0;

@Controller("v1")
@UseGuards(IdentityGuard)
export class CircleMediaController {
  constructor(
    @Inject(CircleMediaService) private readonly media: CircleMediaService,
  ) {}
  @Put("me/circle-media/:upload_id")
  async upload(@Req() req: ApiRequest, @Param("upload_id") id: string) {
    if (!req.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      Object.keys(req.query).length ||
      !req.is("application/octet-stream") ||
      (req.headers["content-encoding"] &&
        req.headers["content-encoding"] !== "identity")
    )
      throw new ApiError(400, "INVALID_INPUT", "请上传图片文件");
    requestId(id);
    const tooLarge = () =>
      new ApiError(413, "IMAGE_TOO_LARGE", "图片超过 5 MB，请选择较小的图片");
    if (Number(req.headers["content-length"]) > mediaBytesLimit)
      throw tooLarge();
    if (receiving >= 6)
      throw new ApiError(503, "MEDIA_BUSY", "图片处理繁忙，请重试");
    receiving++;
    const timer = setTimeout(() => req.destroy(), 20_000);
    timer.unref();
    try {
      const parts: Buffer[] = [];
      let size = 0;
      for await (const part of req.iterator({
        destroyOnReturn: false,
      }) as AsyncIterable<Buffer>) {
        size += part.length;
        if (size > mediaBytesLimit) {
          req.resume();
          throw tooLarge();
        }
        parts.push(part);
      }
      clearTimeout(timer);
      return await this.media.upload(
        req.identity,
        id,
        Buffer.concat(parts, size),
      );
    } finally {
      clearTimeout(timer);
      receiving--;
    }
  }

  @Get("posts/:id/media/:media_id/:variant")
  async get(
    @Req() req: ApiRequest,
    @Res() res: Response,
    @Param("id") post: string,
    @Param("media_id") id: string,
    @Param("variant") variant: string,
  ) {
    if (!req.identity) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
    if (
      Object.keys(req.query).length ||
      (variant !== "thumb" && variant !== "full")
    )
      throw new ApiError(404, "NOT_FOUND", "图片不可查看");
    const image = await this.media.read(req.identity, post, id, variant);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", image.byteLength);
    // end() avoids Express ETag/conditional cache behavior for private bytes.
    res.end(image);
  }
}
