import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { ApiError } from '../common/api-error';
import type { VerifiedIdentity } from '../common/request-context';
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class TokenVerifier {
  private readonly config:
    | {
        issuer: string;
        audience: string;
        algorithm: 'ES256' | 'RS256';
        keys: ReturnType<typeof createRemoteJWKSet>;
      }
    | undefined;
  constructor() {
    if (!process.env.AUTH_ISSUER) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Auth configuration required in production');
      return;
    }
    const issuer = process.env.AUTH_ISSUER.replace(/\/$/, '');
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      throw new Error('Invalid Auth issuer configuration');
    }
    const localTest =
      process.env.NODE_ENV === 'test' &&
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1';
    if (
      (url.protocol !== 'https:' && !localTest) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/auth/v1'
    )
      throw new Error('Invalid Auth issuer configuration');
    const algorithm = process.env.AUTH_JWT_ALGORITHM ?? 'ES256';
    if (algorithm !== 'ES256' && algorithm !== 'RS256')
      throw new Error('Unsupported Auth signing algorithm');
    const audience = process.env.AUTH_AUDIENCE ?? 'authenticated';
    const keys = createRemoteJWKSet(
      new URL(`${issuer}/.well-known/jwks.json`),
      {
        timeoutDuration: 3000,
        [customFetch]: async (input, options) => {
          try {
            const response = await fetch(input, options);
            if (!response.ok) throw new Error('unavailable');
            return response;
          } catch {
            throw new ApiError(
              503,
              'AUTH_PROVIDER_UNAVAILABLE',
              '登录服务暂不可用',
            );
          }
        },
      },
    );
    this.config = { issuer, audience, algorithm, keys };
  }
  async verify(authorization: string | undefined): Promise<VerifiedIdentity> {
    const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
    if (!match?.[1] || match[1].length > 16384)
      throw new ApiError(401, 'AUTH_REQUIRED', '请先登录');
    const config = this.config;
    if (!config)
      throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '登录服务尚未配置');
    try {
      const { payload } = await jwtVerify(match[1], config.keys, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: [config.algorithm],
        requiredClaims: ['sub', 'iat', 'exp', 'iss', 'aud'],
      });
      const now = Math.floor(Date.now() / 1000);
      if (
        !payload.sub ||
        !UUID.test(payload.sub) ||
        payload.role !== 'authenticated' ||
        (payload.is_anonymous !== undefined &&
          payload.is_anonymous !== false) ||
        !Number.isSafeInteger(payload.iat) ||
        payload.iat! > now ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp! <= payload.iat!
      )
        throw new ApiError(401, 'AUTH_REQUIRED', '登录凭据无效');
      return { userId: payload.sub.toLowerCase(), issuedAt: payload.iat! };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = (error as { code?: string }).code;
      if (code === 'ERR_JWT_EXPIRED')
        throw new ApiError(401, 'TOKEN_EXPIRED', '登录已过期，请重新登录');
      const invalid = [
        'ERR_JWS_INVALID',
        'ERR_JWT_INVALID',
        'ERR_JOSE_ALG_NOT_ALLOWED',
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'ERR_JWKS_NO_MATCHING_KEY',
        'ERR_JOSE_NOT_SUPPORTED',
      ];
      if (code && invalid.includes(code))
        throw new ApiError(401, 'AUTH_REQUIRED', '登录凭据无效');
      throw new ApiError(503, 'AUTH_PROVIDER_UNAVAILABLE', '登录服务暂不可用');
    }
  }
}
