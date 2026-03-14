/**
 * Vault manager — handles unlock/lock, vault decryption, search, and URL matching.
 * Read-only for v1 (no push/write).
 */

import type {
  DecryptedFeuille,
  DecryptedSaladier,
  FeuilleData,
  SyncPayload,
  VaultState,
} from "./types";
import * as crypto from "./crypto-bridge";
import * as storage from "./storage";
import * as api from "./api-client";

let cachedSaladiers: DecryptedSaladier[] = [];

/** Get the current vault state */
export async function getState(): Promise<VaultState> {
  const hasKey = await storage.hasDeviceKey();
  if (!hasKey) return { status: "no_device_key" };

  const unlocked = await storage.isUnlocked();
  if (!unlocked) return { status: "locked" };

  return { status: "unlocked", saladiers: cachedSaladiers };
}

/** Unlock the vault using master password + PIN (to decrypt device key) */
export async function unlock(
  email: string,
  password: string,
  pin: string
): Promise<DecryptedSaladier[]> {
  // 1. Load device key with PIN
  const deviceKey = await storage.loadDeviceKey(pin);

  // 2. Get auth info (blind_id, salts)
  let authInfo = await storage.getAuthInfo();

  if (!authInfo) {
    // First-time login — compute blind index and fetch salt
    const blindId = await crypto.computeBlindIndex(email);
    const saltResp = await api.getSalt(blindId);

    // For the extension, we use the same salt for both auth and master
    // The server stores auth_salt; the master_salt is the user's salt_master from registration
    authInfo = {
      blindId,
      authSalt: saltResp,
      masterSalt: saltResp,
    };
    await storage.storeAuthInfo(blindId, saltResp, saltResp);
  }

  // 3. Compute auth hash and login
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const authSaltBytes = base64ToBytes(authInfo.authSalt);

  const authHash = await crypto.computeServerAuthHash(passwordBytes, authSaltBytes);
  const loginResult = await api.login(authInfo.blindId, authHash);

  if ("mfa_token" in loginResult) {
    // Store partial state — caller needs to complete MFA
    throw new MfaRequiredError(loginResult.mfa_token);
  }

  // 4. Reconstruct master key
  const masterSaltBytes = base64ToBytes(authInfo.masterSalt);
  const masterKey = await crypto.reconstructMasterKey(
    passwordBytes,
    deviceKey,
    masterSaltBytes
  );

  // 5. Pull vault from server
  const vaultResp = await api.getVault();
  await storage.cacheVault(vaultResp.vault_blob, vaultResp.version);

  // 6. Decrypt vault
  const saladiers = await decryptVault(masterKey, vaultResp.vault_blob);

  // 7. Store master key in session
  await storage.storeMasterKey(masterKey);
  cachedSaladiers = saladiers;

  return saladiers;
}

/** Complete MFA verification and finish unlock */
export async function completeMfa(
  mfaToken: string,
  totpCode: string,
  password: string,
  pin: string
): Promise<DecryptedSaladier[]> {
  await api.mfaVerify(mfaToken, totpCode);

  const deviceKey = await storage.loadDeviceKey(pin);
  const authInfo = await storage.getAuthInfo();
  if (!authInfo) throw new Error("Informations d'authentification manquantes");

  const encoder = new TextEncoder();
  const masterSaltBytes = base64ToBytes(authInfo.masterSalt);
  const masterKey = await crypto.reconstructMasterKey(
    encoder.encode(password),
    deviceKey,
    masterSaltBytes
  );

  const vaultResp = await api.getVault();
  await storage.cacheVault(vaultResp.vault_blob, vaultResp.version);

  const saladiers = await decryptVault(masterKey, vaultResp.vault_blob);
  await storage.storeMasterKey(masterKey);
  cachedSaladiers = saladiers;

  return saladiers;
}

/** Lock the vault — clear master key and cached data */
export async function lock(): Promise<void> {
  await storage.clearMasterKey();
  cachedSaladiers = [];
}

/** Pull latest vault from server (if unlocked) */
export async function syncPull(): Promise<DecryptedSaladier[]> {
  const masterKey = await storage.loadMasterKey();
  if (!masterKey) throw new Error("Coffre verrouillé");

  // Check if there's a newer version
  const cached = await storage.getCachedVault();
  const status = await api.getSyncStatus();

  if (cached && status.version <= cached.version) {
    return cachedSaladiers; // Already up to date
  }

  const vaultResp = await api.getVault();
  await storage.cacheVault(vaultResp.vault_blob, vaultResp.version);

  cachedSaladiers = await decryptVault(masterKey, vaultResp.vault_blob);
  return cachedSaladiers;
}

/** Search feuilles across all saladiers */
export function search(query: string): DecryptedFeuille[] {
  const q = query.toLowerCase();
  const results: DecryptedFeuille[] = [];

  for (const saladier of cachedSaladiers) {
    for (const feuille of saladier.feuilles) {
      if (
        feuille.data.title.toLowerCase().includes(q) ||
        feuille.data.username.toLowerCase().includes(q) ||
        feuille.data.url.toLowerCase().includes(q) ||
        feuille.data.notes.toLowerCase().includes(q)
      ) {
        results.push(feuille);
      }
    }
  }

  return results;
}

/** Find feuilles matching a URL (for autofill) */
export function getFeuillesForUrl(url: string): DecryptedFeuille[] {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return [];
  }

  const results: DecryptedFeuille[] = [];

  for (const saladier of cachedSaladiers) {
    for (const feuille of saladier.feuilles) {
      try {
        const feuilleHost = new URL(feuille.data.url).hostname;
        if (feuilleHost === hostname || hostname.endsWith(`.${feuilleHost}`)) {
          results.push(feuille);
        }
      } catch {
        // Skip feuilles with invalid URLs
      }
    }
  }

  return results;
}

// ── Internal helpers ──

async function decryptVault(
  masterKey: Uint8Array,
  vaultBlobB64: string
): Promise<DecryptedSaladier[]> {
  const jsonStr = await crypto.decryptVaultBlob(masterKey, vaultBlobB64);
  const payload: SyncPayload = JSON.parse(jsonStr);

  const saladiers: DecryptedSaladier[] = [];

  for (const row of payload.saladiers) {
    // Decrypt saladier name
    let name: string;
    try {
      name = await crypto.decryptSaladierName(
        masterKey,
        row.name_enc,
        row.nonce
      );
    } catch {
      name = "(chiffrement échoué)";
    }

    // Decrypt all feuilles in this saladier
    const feuilles: DecryptedFeuille[] = [];
    const saladierFeuilles = payload.feuilles.filter(
      (f) => f.saladier_id === row.uuid
    );

    for (const fr of saladierFeuilles) {
      try {
        // Feuilles are encrypted with the saladier's key (derived from master key + salt_saladier)
        // For the vault blob, feuilles are already stored with their own nonce
        const dataStr = await crypto.decryptFeuille(
          masterKey,
          fr.data_blob,
          fr.nonce
        );
        const data: FeuilleData = JSON.parse(dataStr);
        feuilles.push({
          uuid: fr.uuid,
          saladier_id: fr.saladier_id,
          saladier_name: name,
          data,
        });
      } catch {
        // Skip feuilles that fail to decrypt
      }
    }

    saladiers.push({
      uuid: row.uuid,
      name,
      hidden: row.hidden === 1,
      feuilles,
    });
  }

  return saladiers;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Error thrown when MFA is required during login */
export class MfaRequiredError extends Error {
  constructor(public readonly mfaToken: string) {
    super("MFA required");
    this.name = "MfaRequiredError";
  }
}
