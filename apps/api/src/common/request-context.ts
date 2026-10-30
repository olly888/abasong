import type { Request } from 'express';
export interface VerifiedIdentity {
  userId: string;
  issuedAt: number;
}
export interface ApiRequest extends Request {
  requestId?: string;
  identity?: VerifiedIdentity;
}
