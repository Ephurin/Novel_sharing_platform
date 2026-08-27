import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '../api/auth-api';
import { setAccessToken } from '../api/api-client';
import type { CurrentUser } from '../api/types';

const tokenStorageKey = 'ephurin_mobile_access_token';

export async function persistSession(accessToken: string) {
  await AsyncStorage.setItem(tokenStorageKey, accessToken);
  setAccessToken(accessToken);
}

export async function clearSession() {
  await AsyncStorage.removeItem(tokenStorageKey);
  setAccessToken(null);
}

export async function restoreSession(): Promise<{ accessToken: string; user: CurrentUser } | null> {
  const accessToken = await AsyncStorage.getItem(tokenStorageKey);

  if (!accessToken) {
    return null;
  }

  setAccessToken(accessToken);

  try {
    const user = await getCurrentUser();
    return { accessToken, user };
  } catch {
    await clearSession();
    return null;
  }
}
