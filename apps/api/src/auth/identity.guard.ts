import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { TokenVerifier } from './token-verifier';
import { ApiError } from '../common/api-error';
import type { ApiRequest } from '../common/request-context';
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(@Inject(TokenVerifier) private readonly verifier:TokenVerifier) {}
  async canActivate(context:ExecutionContext) {
    const request=context.switchToHttp().getRequest<ApiRequest>();
    if(request.rawHeaders.filter((value,index)=>index%2===0&&value.toLowerCase()==='authorization').length>1) throw new ApiError(401,'AUTH_REQUIRED','登录凭据无效');
    request.identity=await this.verifier.verify(request.headers.authorization);
    return true;
  }
}
