import type {
  AuthResponse,
  DecryptedFeuille,
  DecryptedSaladier,
  VaultState,
} from "./types";

// ── Messages from popup/content → background ──

export type BackgroundMessage =
  | { type: "UNLOCK"; payload: { email: string; password: string; pin: string } }
  | { type: "LOCK" }
  | { type: "GET_STATE" }
  | { type: "SYNC_PULL" }
  | { type: "SEARCH"; payload: { query: string } }
  | { type: "GET_FEUILLES_FOR_URL"; payload: { url: string } }
  | { type: "GENERATE_PASSWORD"; payload: { length: number; type: string } }
  | { type: "COPY_TO_CLIPBOARD"; payload: { text: string } }
  | { type: "PAIR_DEVICE"; payload: { phrase: string; pin: string } }
  | { type: "PAIR_DEVICE_CODE"; payload: { code: string; pin: string } }
  | { type: "LOGIN"; payload: { email: string; password: string } }
  | { type: "MFA_VERIFY"; payload: { mfa_token: string; totp_code: string } }
  | { type: "CHECK_DEVICE_KEY" }
  | { type: "UPDATE_SETTINGS"; payload: { api_url?: string; auto_lock_minutes?: number; clipboard_clear_seconds?: number } };

// ── Responses from background → popup/content ──

export type BackgroundResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export interface StateResponse {
  vault: VaultState;
  connected: boolean;
  has_device_key: boolean;
}

// ── Messages from background → content script ──

export type ContentMessage =
  | { type: "AUTOFILL"; payload: { username: string; password: string } }
  | { type: "SHOW_SUGGESTIONS"; payload: { feuilles: DecryptedFeuille[] } }
  | { type: "HIDE_SUGGESTIONS" };

// ── Messages from content script → background ──

export type ContentToBackgroundMessage =
  | { type: "CREDENTIALS_SUBMITTED"; payload: { url: string; username: string; password: string } }
  | { type: "PASSWORD_FIELD_FOCUSED"; payload: { url: string } }
  | { type: "PASSWORD_FIELD_BLURRED" };

// ── Offscreen messages (for WASM crypto in MV3) ──

export type OffscreenRequest =
  | { type: "RECONSTRUCT_KEY"; id: string; password: Uint8Array; device_key: Uint8Array; salt: Uint8Array }
  | { type: "DECRYPT_VAULT"; id: string; master_key: Uint8Array; blob_b64: string }
  | { type: "COMPUTE_BLIND_INDEX"; id: string; email: string }
  | { type: "COMPUTE_AUTH_HASH"; id: string; password: Uint8Array; salt: Uint8Array }
  | { type: "DECRYPT_FEUILLE"; id: string; saladier_key: Uint8Array; data_blob_b64: string; nonce_b64: string }
  | { type: "DECRYPT_SALADIER_NAME"; id: string; master_key: Uint8Array; name_enc_b64: string; nonce_b64: string }
  | { type: "GENERATE_PASSWORD"; id: string; length: number; password_type: string };

export type OffscreenResponse =
  | { type: "RESULT"; id: string; data: unknown }
  | { type: "ERROR"; id: string; error: string };
