import * as SecureStore from 'expo-secure-store';
// Auth credentials only. Native failures never fall back to plaintext storage.
export const sessionStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      throw new Error('无法读取安全登录状态');
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      throw new Error('无法安全保存登录状态');
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      throw new Error('无法清除安全登录状态');
    }
  },
};
