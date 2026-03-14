// ── Vault data types (match Rust SyncPayload exactly) ──

export interface SyncPayload {
  users: UserRow[];
  saladiers: SaladierRow[];
  feuilles: FeuilleRow[];
  settings: SettingsRow[];
}

export interface UserRow {
  id: string;
  salt_master: string; // base64
  k_cloud_enc: string; // base64
  recovery_confirmed: number;
}

export interface SaladierRow {
  uuid: string;
  user_id: string;
  name_enc: string; // base64
  salt_saladier: string; // base64
  nonce: string; // base64
  verify_enc: string; // base64
  verify_nonce: string; // base64
  hidden: number;
  failed_attempts: number;
}

export interface FeuilleRow {
  uuid: string;
  saladier_id: string;
  data_blob: string; // base64
  nonce: string; // base64
}

export interface SettingsRow {
  user_id: string;
  data: string; // JSON string of UserSettings
}

// ── Decrypted types ──

export interface FeuilleData {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export interface DecryptedFeuille {
  uuid: string;
  saladier_id: string;
  saladier_name: string;
  data: FeuilleData;
}

export interface DecryptedSaladier {
  uuid: string;
  name: string;
  hidden: boolean;
  feuilles: DecryptedFeuille[];
}

// ── API response types ──

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface MfaLoginChallengeResponse {
  mfa_token: string;
}

export interface SyncVaultResponse {
  vault_blob: string; // base64
  version: number;
  updated_at: string;
}

export interface SyncStatusResponse {
  version: number;
  updated_at: string;
}

export interface SubscriptionStatusResponse {
  plan: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

// ── Extension settings ──

export interface ExtensionSettings {
  api_url: string;
  auto_lock_minutes: number;
  clipboard_clear_seconds: number;
}

// ── Vault state ──

export type VaultState =
  | { status: "locked" }
  | { status: "unlocked"; saladiers: DecryptedSaladier[] }
  | { status: "no_device_key" }
  | { status: "error"; message: string };
