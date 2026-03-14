/**
 * Chrome storage wrapper.
 *
 * Device key is encrypted with AES-GCM(PBKDF2(PIN)) in chrome.storage.local.
 * Master key is stored in chrome.storage.session (ephemeral).
 */

import { STORAGE_KEYS, SESSION_KEYS } from "./constants";
import type { ExtensionSettings } from "./types";

// ── PIN-based encryption for device key ──

const PBKDF2_ITERATIONS = 600_000;

async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt the device key with a PIN and store it */
export async function storeDeviceKey(
  deviceKey: Uint8Array,
  pin: string
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pinKey = await derivePinKey(pin, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    pinKey,
    deviceKey.buffer as ArrayBuffer
  );

  await chrome.storage.local.set({
    [STORAGE_KEYS.DEVICE_KEY_ENC]: Array.from(new Uint8Array(encrypted)),
    [STORAGE_KEYS.DEVICE_KEY_SALT]: Array.from(salt),
    [STORAGE_KEYS.DEVICE_KEY_IV]: Array.from(iv),
  });
}

/** Decrypt the device key from storage using the PIN */
export async function loadDeviceKey(pin: string): Promise<Uint8Array> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.DEVICE_KEY_ENC,
    STORAGE_KEYS.DEVICE_KEY_SALT,
    STORAGE_KEYS.DEVICE_KEY_IV,
  ]);

  const encBytes = new Uint8Array(result[STORAGE_KEYS.DEVICE_KEY_ENC] as number[]);
  const salt = new Uint8Array(result[STORAGE_KEYS.DEVICE_KEY_SALT] as number[]);
  const iv = new Uint8Array(result[STORAGE_KEYS.DEVICE_KEY_IV] as number[]);

  const pinKey = await derivePinKey(pin, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    pinKey,
    encBytes
  );

  return new Uint8Array(decrypted);
}

/** Check if a device key exists in storage */
export async function hasDeviceKey(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DEVICE_KEY_ENC);
  return !!result[STORAGE_KEYS.DEVICE_KEY_ENC];
}

/** Remove the device key from storage */
export async function removeDeviceKey(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.DEVICE_KEY_ENC,
    STORAGE_KEYS.DEVICE_KEY_SALT,
    STORAGE_KEYS.DEVICE_KEY_IV,
  ]);
}

// ── Master key (session storage — ephemeral) ──

export async function storeMasterKey(masterKey: Uint8Array): Promise<void> {
  await chrome.storage.session.set({
    [SESSION_KEYS.MASTER_KEY]: Array.from(masterKey),
    [SESSION_KEYS.UNLOCKED]: true,
  });
}

export async function loadMasterKey(): Promise<Uint8Array | null> {
  const result = await chrome.storage.session.get(SESSION_KEYS.MASTER_KEY);
  const arr = result[SESSION_KEYS.MASTER_KEY] as number[] | undefined;
  if (!arr) return null;
  return new Uint8Array(arr);
}

export async function clearMasterKey(): Promise<void> {
  await chrome.storage.session.remove([
    SESSION_KEYS.MASTER_KEY,
    SESSION_KEYS.UNLOCKED,
  ]);
}

export async function isUnlocked(): Promise<boolean> {
  const result = await chrome.storage.session.get(SESSION_KEYS.UNLOCKED);
  return !!result[SESSION_KEYS.UNLOCKED];
}

// ── Vault cache ──

export async function cacheVault(
  vaultBlob: string,
  version: number
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.VAULT_CACHE]: vaultBlob,
    [STORAGE_KEYS.VAULT_VERSION]: version,
  });
}

export async function getCachedVault(): Promise<{
  blob: string;
  version: number;
} | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.VAULT_CACHE,
    STORAGE_KEYS.VAULT_VERSION,
  ]);
  if (!result[STORAGE_KEYS.VAULT_CACHE]) return null;
  return {
    blob: result[STORAGE_KEYS.VAULT_CACHE] as string,
    version: (result[STORAGE_KEYS.VAULT_VERSION] as number) || 0,
  };
}

// ── Blind ID & salts ──

export async function storeAuthInfo(
  blindId: string,
  authSalt: string,
  masterSalt: string
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.BLIND_ID]: blindId,
    [STORAGE_KEYS.AUTH_SALT]: authSalt,
    [STORAGE_KEYS.MASTER_SALT]: masterSalt,
  });
}

export async function getAuthInfo(): Promise<{
  blindId: string;
  authSalt: string;
  masterSalt: string;
} | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.BLIND_ID,
    STORAGE_KEYS.AUTH_SALT,
    STORAGE_KEYS.MASTER_SALT,
  ]);
  if (!result[STORAGE_KEYS.BLIND_ID]) return null;
  return {
    blindId: result[STORAGE_KEYS.BLIND_ID] as string,
    authSalt: result[STORAGE_KEYS.AUTH_SALT] as string,
    masterSalt: result[STORAGE_KEYS.MASTER_SALT] as string,
  };
}

// ── Extension settings ──

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return (result[STORAGE_KEYS.SETTINGS] as ExtensionSettings) || {
    api_url: "",
    auto_lock_minutes: 15,
    clipboard_clear_seconds: 30,
  };
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}
