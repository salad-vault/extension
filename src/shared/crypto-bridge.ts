/**
 * Crypto bridge — routes crypto calls through the offscreen document
 * because MV3 service workers cannot load WASM directly.
 *
 * Each call sends a message to the offscreen document and awaits the result.
 */

import type { OffscreenRequest, OffscreenResponse } from "./message-types";

let offscreenReady = false;
const pendingCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let callId = 0;

function nextId(): string {
  return `crypto-${++callId}-${Date.now()}`;
}

/** Ensure the offscreen document is created */
async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return;

  // Check if already exists
  const existingContexts = await (chrome as any).runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length === 0) {
    await (chrome as any).offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "WASM crypto operations (Argon2id, XChaCha20-Poly1305)",
    });
  }

  offscreenReady = true;
}

/** Send a crypto request to the offscreen document and await the response */
async function callOffscreen(request: OffscreenRequest): Promise<unknown> {
  await ensureOffscreen();

  return new Promise((resolve, reject) => {
    pendingCalls.set(request.id, { resolve, reject });

    chrome.runtime.sendMessage(request).catch((err) => {
      pendingCalls.delete(request.id);
      reject(new Error(`Offscreen message failed: ${err}`));
    });
  });
}

/** Handle responses from the offscreen document */
export function handleOffscreenResponse(msg: OffscreenResponse): boolean {
  if (msg.type !== "RESULT" && msg.type !== "ERROR") return false;

  const pending = pendingCalls.get(msg.id);
  if (!pending) return false;

  pendingCalls.delete(msg.id);

  if (msg.type === "ERROR") {
    pending.reject(new Error(msg.error));
  } else {
    pending.resolve(msg.data);
  }

  return true;
}

// ── Typed crypto wrappers ──

export async function reconstructMasterKey(
  password: Uint8Array,
  deviceKey: Uint8Array,
  salt: Uint8Array
): Promise<Uint8Array> {
  const id = nextId();
  const result = await callOffscreen({
    type: "RECONSTRUCT_KEY",
    id,
    password,
    device_key: deviceKey,
    salt,
  });
  return new Uint8Array(result as ArrayBuffer);
}

export async function decryptVaultBlob(
  masterKey: Uint8Array,
  blobB64: string
): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "DECRYPT_VAULT",
    id,
    master_key: masterKey,
    blob_b64: blobB64,
  })) as string;
}

export async function computeBlindIndex(email: string): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "COMPUTE_BLIND_INDEX",
    id,
    email,
  })) as string;
}

export async function computeServerAuthHash(
  password: Uint8Array,
  salt: Uint8Array
): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "COMPUTE_AUTH_HASH",
    id,
    password,
    salt,
  })) as string;
}

export async function decryptFeuille(
  saladierKey: Uint8Array,
  dataBlobB64: string,
  nonceB64: string
): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "DECRYPT_FEUILLE",
    id,
    saladier_key: saladierKey,
    data_blob_b64: dataBlobB64,
    nonce_b64: nonceB64,
  })) as string;
}

export async function decryptSaladierName(
  masterKey: Uint8Array,
  nameEncB64: string,
  nonceB64: string
): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "DECRYPT_SALADIER_NAME",
    id,
    master_key: masterKey,
    name_enc_b64: nameEncB64,
    nonce_b64: nonceB64,
  })) as string;
}

export async function generatePassword(
  length: number,
  passwordType: string
): Promise<string> {
  const id = nextId();
  return (await callOffscreen({
    type: "GENERATE_PASSWORD",
    id,
    length,
    password_type: passwordType,
  })) as string;
}
