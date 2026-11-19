import * as SecureStore from 'expo-secure-store';
import type { PendingRegistration, RegistrationContext } from '../api/auth-api';

const key = 'storycraft.pending-signup';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function savePendingRegistration({ registrationId, resendToken, expiresAt }: PendingRegistration) {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(key, JSON.stringify({ registrationId, resendToken, expiresAt }), options);
  }
}

export async function clearPendingRegistration() {
  if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(key, options);
}

export async function readPendingRegistration(): Promise<RegistrationContext | null> {
  if (!await SecureStore.isAvailableAsync()) return null;
  const stored = await SecureStore.getItemAsync(key, options);
  if (!stored) return null;
  try {
    const { registrationId, resendToken, expiresAt } = JSON.parse(stored) as Partial<PendingRegistration>;
    if (typeof registrationId === 'string' && typeof resendToken === 'string'
      && typeof expiresAt === 'string' && Date.parse(expiresAt) > Date.now()) {
      return { registrationId, resendToken };
    }
  } catch {
    // Discard a malformed or expired local record.
  }
  await clearPendingRegistration();
  return null;
}
