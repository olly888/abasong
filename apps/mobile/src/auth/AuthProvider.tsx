import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, AUTH_STORAGE_KEY } from './supabase';
import { sessionStorage } from './secure-storage';
import { accountRequest, AccountError, type Me } from './api-client';
type Phase =
  | 'signing-out'
  | 'logout-error'
  | 'restoring'
  | 'guest'
  | 'loading-account'
  | 'needs-profile'
  | 'ready'
  | 'error';
type State = {
  phase: Phase;
  session: Session | null;
  me: Me | null;
  error: string | null;
};
type AuthValue = State & {
  pendingPhone: string | null;
  resendAt: number;
  sendCode: (phone: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  completeProfile: (name: string, key: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryAccount: () => void;
};
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    phase: 'restoring',
    session: null,
    me: null,
    error: null,
  });
  const [pendingPhone, setPendingPhone] = useState<string | null>(null),
    [resendAt, setResendAt] = useState(0),
    [retry, setRetry] = useState(0);
  const owner = useRef<string | null>(null),
    identityVersion = useRef(0),
    inFlight = useRef(false),
    signingOut = useRef(false),
    ignoreSessionEvents = useRef(false);
  const observe = useCallback((session: Session | null) => {
    if (ignoreSessionEvents.current) return;
    if (session) setRetry((value) => value + 1);
    if (owner.current !== (session?.user.id ?? null)) {
      identityVersion.current++;
      owner.current = session?.user.id ?? null;
      setPendingPhone(null);
      setResendAt(0);
    }
    setState({
      phase: session ? 'loading-account' : 'guest',
      session,
      me: null,
      error: null,
    });
  }, []);
  useEffect(() => {
    if (!supabase) {
      setState({ phase: 'guest', session: null, me: null, error: null });
      return;
    }
    let alive = true,
      eventVersion = 0;
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      eventVersion++;
      if (alive) observe(session);
    });
    const initialVersion = eventVersion;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive || eventVersion !== initialVersion) return;
        if (error)
          setState({
            phase: 'error',
            session: null,
            me: null,
            error: '无法恢复登录，请重新登录',
          });
        else observe(data.session);
      })
      .catch(() => {
        if (alive)
          setState({
            phase: 'error',
            session: null,
            me: null,
            error: '无法恢复登录，请重新登录',
          });
      });
    const appState = AppState.addEventListener('change', (value) => {
      if (value === 'active') {
        void supabase?.auth.startAutoRefresh();
        if (!ignoreSessionEvents.current) {
          setState((current) =>
            current.session
              ? { ...current, phase: 'loading-account', me: null, error: null }
              : current,
          );
          setRetry((current) => current + 1);
        }
      } else void supabase?.auth.stopAutoRefresh();
    });
    if (AppState.currentState === 'active')
      void supabase.auth.startAutoRefresh();
    return () => {
      alive = false;
      subscription.data.subscription.unsubscribe();
      appState.remove();
      void supabase?.auth.stopAutoRefresh();
    };
  }, [observe]);
  useEffect(() => {
    const session = state.session;
    if (!session) return;
    const version = identityVersion.current,
      controller = new AbortController();
    let alive = true;
    void accountRequest(session, undefined, undefined, controller.signal)
      .then((me) => {
        if (alive && version === identityVersion.current)
          setState((current) => ({
            ...current,
            phase: 'ready',
            me,
            error: null,
          }));
      })
      .catch((error) => {
        if (!alive || version !== identityVersion.current) return;
        const needsProfile =
          error instanceof AccountError && error.status === 404;
        setState((current) => ({
          ...current,
          phase: needsProfile ? 'needs-profile' : 'error',
          me: null,
          error: needsProfile
            ? null
            : error instanceof AccountError
              ? error.message
              : '服务暂不可用',
        }));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [state.session?.access_token, retry]);
  async function sendCode(phone: string) {
    if (!supabase) throw new Error('登录服务暂不可用');
    if (inFlight.current) throw new Error('正在处理中，请稍候');
    if (Date.now() < resendAt) throw new Error('请稍候再重新发送');
    inFlight.current = true;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: 'sms' },
      });
      if (error)
        throw new Error(
          error.status === 429
            ? '发送过于频繁，请稍后重试'
            : '暂时无法发送验证码，请稍后重试',
        );
      setPendingPhone(phone);
      setResendAt(Date.now() + 60000);
    } finally {
      inFlight.current = false;
    }
  }
  async function verifyCode(code: string) {
    if (!supabase || !pendingPhone) throw new Error('请重新获取验证码');
    if (inFlight.current) throw new Error('正在处理中，请稍候');
    inFlight.current = true;
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: code,
        type: 'sms',
      });
      if (error)
        throw new Error(
          error.status === 429
            ? '操作过于频繁，请稍后重试'
            : '验证码不正确或已过期',
        );
    } finally {
      inFlight.current = false;
    }
  }
  async function completeProfile(name: string, key: string) {
    const session = state.session;
    if (!session) throw new Error('请先登录');
    const version = identityVersion.current;
    const me = await accountRequest(session, { display_name: name }, key);
    if (version !== identityVersion.current)
      throw new Error('登录状态已变化，请重试');
    setState((current) => ({ ...current, phase: 'ready', me, error: null }));
  }
  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    ignoreSessionEvents.current = true;
    identityVersion.current++;
    owner.current = null;
    setPendingPhone(null);
    setResendAt(0);
    setState({ phase: 'signing-out', session: null, me: null, error: null });
    try {
      await supabase?.auth.signOut({ scope: 'local' });
      await sessionStorage.removeItem(AUTH_STORAGE_KEY);
      await sessionStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
      await sessionStorage.removeItem(`${AUTH_STORAGE_KEY}-user`);
      ignoreSessionEvents.current = false;
      setState({ phase: 'guest', session: null, me: null, error: null });
    } catch {
      setState({
        phase: 'logout-error',
        session: null,
        me: null,
        error: '无法清除安全登录状态，请重试退出',
      });
      throw new Error('退出登录未完成，请重试');
    } finally {
      signingOut.current = false;
    }
  }
  return (
    <Context.Provider
      value={{
        ...state,
        pendingPhone,
        resendAt,
        sendCode,
        verifyCode,
        completeProfile,
        signOut,
        retryAccount: () => {
          setState((current) => ({
            ...current,
            phase: 'loading-account',
            me: null,
            error: null,
          }));
          setRetry((value) => value + 1);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider required');
  return value;
}
