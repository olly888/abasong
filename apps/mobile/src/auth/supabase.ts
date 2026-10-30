import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { sessionStorage } from './secure-storage';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const AUTH_STORAGE_KEY = url
  ? `abasong.${new URL(url).hostname}.auth`
  : 'abasong.auth';
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: sessionStorage,
          storageKey: AUTH_STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          debug: false,
        },
      })
    : null;
