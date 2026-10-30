import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { components } from '@abasong/contracts';
import { supabase } from './supabase';
export type Me = components['schemas']['Me'];
export class AccountError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const base =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '') ||
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:3001'
    : 'http://127.0.0.1:3001');
export async function accountRequest(
  session: Session,
  body?: { display_name: string },
  key?: string,
  signal?: AbortSignal,
): Promise<Me> {
  if (!__DEV__ && !base.startsWith('https://'))
    throw new AccountError(503, 'API_NOT_CONFIGURED', '登录服务暂不可用');
  async function perform(token: string) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 10000);
    try {
      const response = await fetch(`${base}/v1/me${body ? '/bootstrap' : ''}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Idempotency-Key': key ?? '',
              }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new AccountError(
          response.status,
          result.code ?? 'UNAVAILABLE',
          typeof result.message === 'string' ? result.message : '服务暂不可用',
        );
      if (
        result.user_id !== session.user.id ||
        result.profile?.user_id !== session.user.id ||
        result.status !== 'active' ||
        !Array.isArray(result.capabilities)
      )
        throw new AccountError(503, 'INVALID_RESPONSE', '服务暂不可用');
      return result as Me;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(
        503,
        'NETWORK_UNAVAILABLE',
        '暂时无法连接，请稍后重试',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  try {
    return await perform(session.access_token);
  } catch (error) {
    if (!(error instanceof AccountError) || error.status !== 401 || !supabase)
      throw error;
    const refreshed = await supabase.auth.refreshSession();
    if (
      refreshed.error ||
      !refreshed.data.session ||
      refreshed.data.session.user.id !== session.user.id
    )
      throw new AccountError(401, 'AUTH_REQUIRED', '请重新登录');
    return perform(refreshed.data.session.access_token);
  }
}
