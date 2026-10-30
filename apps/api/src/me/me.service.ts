import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { components } from '@abasong/contracts';
import { Database } from '../database/database.service';
import { ApiError } from '../common/api-error';
import type { VerifiedIdentity } from '../common/request-context';
import { UUID } from '../auth/token-verifier';
type Me = components['schemas']['Me'];
const bootstrapInput = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) =>
        [...value].every(
          (char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127,
        ),
      ),
  })
  .strict();
interface UserRow {
  id: string;
  status: Me['status'];
  session_invalid_before: Date | null;
}
@Injectable()
export class MeService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private checkUser(user: UserRow | undefined, identity: VerifiedIdentity) {
    if (!user) throw new ApiError(404, 'NOT_FOUND', '请先完成个人资料');
    if (user.status === 'suspended')
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', '账号已暂停使用');
    if (user.status !== 'active')
      throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', '账号当前不可用');
    if (
      user.session_invalid_before &&
      identity.issuedAt * 1000 <= user.session_invalid_before.getTime()
    )
      throw new ApiError(401, 'SESSION_REVOKED', '登录已失效，请重新登录');
  }
  private async view(
    client: PoolClient,
    identity: VerifiedIdentity,
  ): Promise<Me> {
    const user = (
      await client.query<UserRow>(
        'SELECT id,status,session_invalid_before FROM abasong.users WHERE id=$1',
        [identity.userId],
      )
    ).rows[0];
    this.checkUser(user, identity);
    const profile = (
      await client.query<Me['profile']>(
        'SELECT user_id,display_name,bio,vehicle_type,experience FROM abasong.profiles WHERE user_id=$1',
        [identity.userId],
      )
    ).rows[0];
    if (!profile) throw new ApiError(404, 'NOT_FOUND', '请先完成个人资料');
    const verified = await client.query(
      'SELECT carrier,region_label,description FROM abasong.experience_verifications WHERE user_id=$1 AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now()) ORDER BY created_at,id',
      [identity.userId],
    );
    const capabilities = await client.query<{ capability: string }>(
      'SELECT DISTINCT capability FROM abasong.capabilities WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY capability',
      [identity.userId],
    );
    return {
      user_id: identity.userId,
      status: 'active',
      profile: {
        ...profile,
        experience: [
          ...profile.experience.map((row) => ({
            carrier: row.carrier,
            region_label: row.region_label,
            description: row.description,
            source: 'self_reported' as const,
          })),
          ...verified.rows.map((row) => ({
            carrier: row.carrier,
            region_label: row.region_label,
            description: row.description,
            source: 'verified' as const,
          })),
        ],
      },
      capabilities: capabilities.rows.map((row) => row.capability),
    };
  }
  private async connect() {
    try {
      return await this.db.pool.connect();
    } catch {
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', '服务暂不可用');
    }
  }
  async get(identity: VerifiedIdentity): Promise<Me> {
    const client = await this.connect();
    try {
      return await this.view(client, identity);
    } finally {
      client.release();
    }
  }
  async bootstrap(
    identity: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ): Promise<Me> {
    const input = bootstrapInput.safeParse(body);
    if (!input.success || !key || !UUID.test(key))
      throw new ApiError(400, 'INVALID_INPUT', '请填写姓名并提供有效请求编号');
    const secret = process.env.IDEMPOTENCY_HMAC_KEY,
      retention = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
    if (
      !secret ||
      !/^[a-f0-9]{64}$/i.test(secret) ||
      !Number.isSafeInteger(retention) ||
      retention <= 0
    )
      throw new ApiError(503, 'IDEMPOTENCY_NOT_CONFIGURED', '服务暂不可用');
    const digest = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(JSON.stringify(input.data))
      .digest();
    const route = '/v1/me/bootstrap';
    const client = await this.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [identity.userId],
      );
      await client.query(
        'INSERT INTO abasong.users(id) VALUES($1) ON CONFLICT(id) DO NOTHING',
        [identity.userId],
      );
      const user = (
        await client.query<UserRow>(
          'SELECT id,status,session_invalid_before FROM abasong.users WHERE id=$1 FOR UPDATE',
          [identity.userId],
        )
      ).rows[0];
      this.checkUser(user, identity);
      await client.query(
        'DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at<=now()',
        [identity.userId, route, key],
      );
      const previous = (
        await client.query<{ request_hmac: Buffer; status: string }>(
          'SELECT request_hmac,status FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 FOR UPDATE',
          [identity.userId, route, key],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.request_hmac.length !== digest.length ||
          !timingSafeEqual(previous.request_hmac, digest)
        )
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            '请求编号已用于其他内容',
          );
        if (previous.status !== 'completed')
          throw new ApiError(409, 'REQUEST_IN_PROGRESS', '请求仍在处理中');
      } else {
        await client.query(
          'INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',
          [identity.userId, input.data.display_name],
        );
        await client.query(
          "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',200,$1,now()+$5*interval '1 second')",
          [identity.userId, route, key, digest, retention],
        );
        await client.query(
          "INSERT INTO abasong.audit_events(actor_id,request_id,action,object_type,object_id,result) VALUES($1,$2,'account.bootstrap','user',$1,'success')",
          [identity.userId, requestId],
        );
      }
      const result = await this.view(client, identity);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
