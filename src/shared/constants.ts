/** Default API base URL — user can override in extension settings */
export const DEFAULT_API_URL = "https://api.saladvault.com";

/** chrome.storage keys */
export const STORAGE_KEYS = {
  DEVICE_KEY_ENC: "device_key_enc",
  DEVICE_KEY_SALT: "device_key_salt",
  DEVICE_KEY_IV: "device_key_iv",
  VAULT_CACHE: "vault_cache",
  VAULT_VERSION: "vault_version",
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  API_URL: "api_url",
  SETTINGS: "settings",
  BLIND_ID: "blind_id",
  AUTH_SALT: "auth_salt",
  MASTER_SALT: "master_salt",
} as const;

/** Session storage keys (ephemeral, cleared on browser close) */
export const SESSION_KEYS = {
  MASTER_KEY: "master_key",
  UNLOCKED: "unlocked",
} as const;

/** Auto-lock alarm name */
export const ALARM_AUTO_LOCK = "saladvault-auto-lock";

/** Periodic sync alarm */
export const ALARM_PERIODIC_SYNC = "saladvault-periodic-sync";

/** Sync interval in minutes */
export const SYNC_INTERVAL_MINUTES = 15;

/** Clipboard clear delay in ms (default 30s) */
export const DEFAULT_CLIPBOARD_CLEAR_MS = 30_000;
