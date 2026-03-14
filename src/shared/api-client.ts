/**
 * HTTP client for the SaladVault API.
 * Mirrors rust-app/src-tauri/src/sync/client.rs
 */

import type {
  AuthResponse,
  MfaLoginChallengeResponse,
  SubscriptionStatusResponse,
  SyncStatusResponse,
  SyncVaultResponse,
} from "./types";
import { DEFAULT_API_URL, STORAGE_KEYS } from "./constants";

async function getApiUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_URL);
  return (result[STORAGE_KEYS.API_URL] as string) || DEFAULT_API_URL;
}

async function getTokens(): Promise<{ access: string; refresh: string }> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
  ]);
  return {
    access: (result[STORAGE_KEYS.ACCESS_TOKEN] as string) || "",
    refresh: (result[STORAGE_KEYS.REFRESH_TOKEN] as string) || "",
  };
}

async function saveTokens(access: string, refresh: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: access,
    [STORAGE_KEYS.REFRESH_TOKEN]: refresh,
  });
}

async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
  ]);
}

/** Make an authenticated request with automatic token refresh */
async function authFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = await getApiUrl();
  const tokens = await getTokens();

  const headers = new Headers(options.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${tokens.access}`);
  headers.set("Content-Type", "application/json");

  const fetchOpts: RequestInit = { ...options, headers };
  let response = await fetch(`${baseUrl}${path}`, fetchOpts);

  // If 401, try to refresh the token
  if (response.status === 401 && tokens.refresh) {
    const refreshed = await refreshToken(tokens.refresh);
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed.access_token}`);
      response = await fetch(`${baseUrl}${path}`, fetchOpts);
    }
  }

  return response;
}

// ── Auth endpoints ──

export async function login(
  blindId: string,
  authHash: string
): Promise<AuthResponse | MfaLoginChallengeResponse> {
  const baseUrl = await getApiUrl();
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blind_id: blindId, auth_hash: authHash }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Échec de connexion: ${text}`);
  }

  const data = await response.json();

  // If MFA is required, the response has mfa_token instead of access_token
  if ("mfa_token" in data) {
    return data as MfaLoginChallengeResponse;
  }

  const auth = data as AuthResponse;
  await saveTokens(auth.access_token, auth.refresh_token);
  return auth;
}

export async function mfaVerify(
  mfaToken: string,
  totpCode: string
): Promise<AuthResponse> {
  const baseUrl = await getApiUrl();
  const response = await fetch(`${baseUrl}/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfa_token: mfaToken, totp_code: totpCode }),
  });

  if (!response.ok) {
    throw new Error("Code MFA invalide");
  }

  const auth: AuthResponse = await response.json();
  await saveTokens(auth.access_token, auth.refresh_token);
  return auth;
}

async function refreshToken(
  token: string
): Promise<AuthResponse | null> {
  const baseUrl = await getApiUrl();
  try {
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const auth: AuthResponse = await response.json();
    await saveTokens(auth.access_token, auth.refresh_token);
    return auth;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await authFetch("/auth/logout", { method: "POST" });
  } catch {
    // Ignore errors — we clear local tokens regardless
  }
  await clearTokens();
}

// ── Sync endpoints ──

export async function getVault(): Promise<SyncVaultResponse> {
  const response = await authFetch("/sync/vault");
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Aucun coffre synchronisé");
    }
    throw new Error(`Erreur sync: ${response.status}`);
  }
  return response.json();
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  const response = await authFetch("/sync/status");
  if (!response.ok) {
    throw new Error(`Erreur statut sync: ${response.status}`);
  }
  return response.json();
}

// ── Salt endpoint (for getting user's master salt) ──

export async function getSalt(blindId: string): Promise<string> {
  const baseUrl = await getApiUrl();
  const response = await fetch(`${baseUrl}/auth/salt/${blindId}`);
  if (!response.ok) {
    throw new Error("Utilisateur non trouvé");
  }
  const data = await response.json();
  return data.salt;
}

// ── Subscription ──

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  const response = await authFetch("/subscription/status");
  if (!response.ok) {
    throw new Error(`Erreur abonnement: ${response.status}`);
  }
  return response.json();
}

// ── Connection check ──

export async function isConnected(): Promise<boolean> {
  const tokens = await getTokens();
  return !!tokens.access;
}
