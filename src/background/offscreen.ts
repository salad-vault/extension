/**
 * Offscreen document — loads the WASM module and handles crypto requests
 * from the service worker (which cannot load WASM in MV3).
 */

import type { OffscreenRequest, OffscreenResponse } from "../shared/message-types";

// Import the WASM module
import init, {
  reconstruct_master_key,
  decrypt_vault_blob,
  compute_blind_index,
  compute_server_auth_hash,
  generate_password,
  decrypt_feuille,
  decrypt_saladier_name,
} from "../../wasm-pkg/saladvault_crypto_wasm";

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  if (!wasmInitPromise) {
    wasmInitPromise = init().then(() => {
      wasmReady = true;
    });
  }
  await wasmInitPromise;
}

chrome.runtime.onMessage.addListener((msg: OffscreenRequest, _sender, sendResponse) => {
  handleRequest(msg)
    .then((data) => {
      const resp: OffscreenResponse = { type: "RESULT", id: msg.id, data };
      chrome.runtime.sendMessage(resp);
    })
    .catch((err) => {
      const resp: OffscreenResponse = { type: "ERROR", id: msg.id, error: err.message || String(err) };
      chrome.runtime.sendMessage(resp);
    });

  return false;
});

async function handleRequest(msg: OffscreenRequest): Promise<unknown> {
  await ensureWasm();

  switch (msg.type) {
    case "RECONSTRUCT_KEY":
      return reconstruct_master_key(
        new Uint8Array(msg.password),
        new Uint8Array(msg.device_key),
        new Uint8Array(msg.salt)
      );

    case "DECRYPT_VAULT":
      return decrypt_vault_blob(
        new Uint8Array(msg.master_key),
        msg.blob_b64
      );

    case "COMPUTE_BLIND_INDEX":
      return compute_blind_index(msg.email);

    case "COMPUTE_AUTH_HASH":
      return compute_server_auth_hash(
        new Uint8Array(msg.password),
        new Uint8Array(msg.salt)
      );

    case "DECRYPT_FEUILLE":
      return decrypt_feuille(
        new Uint8Array(msg.saladier_key),
        msg.data_blob_b64,
        msg.nonce_b64
      );

    case "DECRYPT_SALADIER_NAME":
      return decrypt_saladier_name(
        new Uint8Array(msg.master_key),
        msg.name_enc_b64,
        msg.nonce_b64
      );

    case "GENERATE_PASSWORD":
      return generate_password(msg.length, msg.password_type);

    default:
      throw new Error(`Unknown offscreen request type`);
  }
}
