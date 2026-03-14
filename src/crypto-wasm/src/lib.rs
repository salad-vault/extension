use wasm_bindgen::prelude::*;
use base64::Engine;
use zeroize::Zeroize;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;

// ── Constants (must match desktop exactly) ──

const MEMORY_COST_KB: u32 = 65536; // 64 MB
const TIME_COST: u32 = 3;
const PARALLELISM: u32 = 4;
const OUTPUT_LEN: usize = 32;
const HKDF_INFO: &[u8] = b"SaladVault_MasterKey_v2";
const PEPPER_SEED: &[u8] = b"SaladVault_BlindIndex_Pepper_v1";
const EMAIL_BLIND_INDEX_SALT: &[u8] = b"SaladVault_Email_Salt_v1";

const ALPHA_CHARS: &[u8] =
    b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";

const PASSPHRASE_WORDS: &[&str] = &[
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
    "across", "action", "actor", "actual", "adapt", "address", "adjust", "admit",
    "adult", "advance", "advice", "afford", "agree", "airport", "alarm", "album",
    "alert", "alien", "almost", "alone", "alpha", "already", "alter", "always",
    "amazing", "among", "amount", "ancient", "anger", "angle", "animal", "annual",
    "another", "answer", "antenna", "anxiety", "apart", "apology", "appear", "apple",
    "approve", "arena", "argue", "army", "arrow", "artist", "artwork", "assume",
    "attack", "attend", "attract", "auction", "audit", "august", "aunt", "author",
    "avocado", "avoid", "awake", "aware", "awesome", "awful", "awkward", "axis",
    "baby", "bachelor", "bacon", "badge", "balance", "banana", "banner", "barely",
    "barrel", "basic", "basket", "battle", "beach", "beauty", "because", "become",
    "before", "begin", "behind", "believe", "below", "bench", "benefit", "best",
    "betray", "better", "between", "beyond", "bicycle", "bitter", "black", "blade",
    "blame", "blanket", "blast", "bleak", "bless", "blind", "blood", "blossom",
    "blue", "blur", "board", "boat", "body", "bomb", "bone", "bonus",
    "book", "border", "boring", "borrow", "bottom", "bounce", "brain", "brand",
    "brave", "bread", "breeze", "brick", "bridge", "brief", "bright", "bring",
    "broken", "bronze", "brother", "brown", "brush", "bubble", "buddy", "budget",
    "buffalo", "build", "bullet", "bundle", "burden", "burger", "burst", "busy",
    "butter", "cabin", "cable", "cactus", "cage", "cake", "camera", "camp",
    "canal", "cancel", "candy", "cannon", "canyon", "capable", "capital", "captain",
    "carbon", "cargo", "carpet", "carry", "castle", "casual", "catch", "cattle",
    "cause", "ceiling", "celery", "cement", "census", "cereal", "certain", "chair",
    "chalk", "champion", "change", "chaos", "chapter", "charge", "chase", "cheap",
    "check", "cheese", "cherry", "chicken", "chief", "child", "chimney", "choice",
    "chronic", "chunk", "circle", "citizen", "claim", "clap", "clarify", "claw",
    "clean", "clerk", "clever", "cliff", "climb", "clinic", "clock", "close",
    "cloud", "clown", "cluster", "coach", "coconut", "coffee", "collect", "color",
    "column", "combine", "comfort", "common", "company", "concert", "conduct", "confirm",
    "congress", "connect", "consider", "control", "convince", "cookie", "copper", "coral",
    "correct", "cosmic", "cotton", "couch", "country", "couple", "course", "cousin",
    "cover", "crack", "cradle", "craft", "cream", "credit", "cricket", "crime",
    "crisp", "critic", "crop", "cross", "crouch", "crowd", "crucial", "cruel",
    "cruise", "crumble", "crush", "crystal", "cube", "culture", "cupboard", "curious",
    "current", "curtain", "curve", "cushion", "custom", "cycle", "damage", "dance",
    "danger", "daring", "dash", "daughter", "dawn", "debate", "debris", "decade",
    "december", "decide", "decline", "decorate", "decrease", "defense", "define", "delay",
    "deliver", "demand", "denial", "dentist", "depend", "deposit", "depth", "deputy",
    "derive", "describe", "desert", "design", "destroy", "detail", "detect", "develop",
    "device", "devote", "diagram", "diamond", "diary", "diesel", "diet", "differ",
    "digital", "dignity", "dilemma", "dinner", "dinosaur", "direct", "discover", "disease",
    "display", "distance", "divide", "dizzy", "doctor", "document", "dolphin", "domain",
    "donate", "donkey", "donor", "door", "double", "dove", "draft", "dragon",
    "drama", "drastic", "dream", "dress", "drift", "drink", "drive", "drop",
    "drum", "during", "dust", "dutch", "duty", "dwarf", "dynamic", "eager",
    "eagle", "early", "earth", "easily", "east", "easy", "echo", "ecology",
    "economy", "educate", "effort", "eight", "either", "elbow", "elder", "electric",
    "elegant", "element", "elephant", "elite", "else", "embrace", "emerge", "emotion",
    "employ", "empower", "empty", "enable", "enact", "endless", "endorse", "enemy",
    "energy", "enforce", "engage", "engine", "enhance", "enjoy", "enough", "enrich",
    "ensure", "entire", "entry", "envelope", "episode", "equal", "equip", "erode",
    "erosion", "error", "escape", "essay", "estate", "eternal", "evidence", "evil",
    "evolve", "exact", "example", "excess", "exchange", "excite", "exclude", "excuse",
];

// ── Argon2id KDF ──

fn derive_key(password: &[u8], salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(MEMORY_COST_KB, TIME_COST, PARALLELISM, Some(OUTPUT_LEN))
        .map_err(|e| format!("Argon2 params error: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut output = [0u8; OUTPUT_LEN];
    argon2
        .hash_password_into(password, salt, &mut output)
        .map_err(|e| format!("Argon2 hash error: {e}"))?;
    Ok(output)
}

// ── XChaCha20-Poly1305 ──

fn encrypt_raw(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Cipher init error: {e}"))?;
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "Encryption failed".to_string())?;
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce);
    packed.extend_from_slice(&ciphertext);
    Ok(packed)
}

fn decrypt_raw(key: &[u8; 32], nonce_and_ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    if nonce_and_ciphertext.len() < 24 {
        return Err("Data too short (missing nonce)".to_string());
    }
    let (nonce_bytes, ciphertext) = nonce_and_ciphertext.split_at(24);
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Cipher init error: {e}"))?;
    let nonce = XNonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong key or corrupted data".to_string())
}

// ── Blind Index ──

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn compute_blind_index_inner(email: &str, static_salt: &[u8], pepper: &[u8]) -> Result<String, String> {
    let normalized = email.trim().to_lowercase();
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(pepper)
        .map_err(|e| format!("HMAC init error: {e}"))?;
    mac.update(normalized.as_bytes());
    mac.update(static_salt);
    let result = mac.finalize();
    Ok(hex_encode(&result.into_bytes()))
}

// ── WASM Exports ──

/// Reconstruct the master key using the Dual-Lock protocol:
///   1. derived = Argon2id(password, salt)
///   2. PRK = HKDF-Extract(salt=device_key, ikm=derived)
///   3. MasterKey = HKDF-Expand(PRK, "SaladVault_MasterKey_v2", 32)
///
/// Returns the 32-byte master key.
#[wasm_bindgen]
pub fn reconstruct_master_key(
    password: &[u8],
    device_key: &[u8],
    salt: &[u8],
) -> Result<Vec<u8>, JsValue> {
    if device_key.len() != 32 {
        return Err(JsValue::from_str("Device key must be 32 bytes"));
    }
    let dk: &[u8; 32] = device_key.try_into().unwrap();

    let mut derived = derive_key(password, salt)
        .map_err(|e| JsValue::from_str(&e))?;

    let hk = Hkdf::<Sha256>::new(Some(dk), &derived);
    let mut master_key = [0u8; 32];
    hk.expand(HKDF_INFO, &mut master_key)
        .map_err(|e| JsValue::from_str(&format!("HKDF error: {e}")))?;

    derived.zeroize();

    Ok(master_key.to_vec())
}

/// Encrypt plaintext with a 32-byte key.
/// Returns nonce (24 bytes) || ciphertext.
#[wasm_bindgen]
pub fn encrypt(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
    if key.len() != 32 {
        return Err(JsValue::from_str("Key must be 32 bytes"));
    }
    let k: &[u8; 32] = key.try_into().unwrap();
    encrypt_raw(k, plaintext).map_err(|e| JsValue::from_str(&e))
}

/// Decrypt data encrypted with `encrypt`.
/// Input: nonce (24 bytes) || ciphertext.
#[wasm_bindgen]
pub fn decrypt(key: &[u8], nonce_and_ciphertext: &[u8]) -> Result<Vec<u8>, JsValue> {
    if key.len() != 32 {
        return Err(JsValue::from_str("Key must be 32 bytes"));
    }
    let k: &[u8; 32] = key.try_into().unwrap();
    decrypt_raw(k, nonce_and_ciphertext).map_err(|e| JsValue::from_str(&e))
}

/// Decrypt a vault blob (base64-encoded nonce||ciphertext) and return the JSON payload.
#[wasm_bindgen]
pub fn decrypt_vault_blob(master_key: &[u8], blob_base64: &str) -> Result<String, JsValue> {
    if master_key.len() != 32 {
        return Err(JsValue::from_str("Master key must be 32 bytes"));
    }
    let k: &[u8; 32] = master_key.try_into().unwrap();
    let b64 = base64::engine::general_purpose::STANDARD;

    let packed = b64.decode(blob_base64)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {e}")))?;

    let plaintext = decrypt_raw(k, &packed)
        .map_err(|e| JsValue::from_str(&e))?;

    String::from_utf8(plaintext)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 decode error: {e}")))
}

/// Compute a server-side blind index for an email address.
/// Uses the compile-time PEPPER_SEED for deterministic cross-device results.
#[wasm_bindgen]
pub fn compute_blind_index(email: &str) -> Result<String, JsValue> {
    compute_blind_index_inner(email, EMAIL_BLIND_INDEX_SALT, PEPPER_SEED)
        .map_err(|e| JsValue::from_str(&e))
}

/// Compute the server auth hash: Argon2id(password, salt) → hex.
/// Used for server login (separate derivation from master key).
#[wasm_bindgen]
pub fn compute_server_auth_hash(password: &[u8], salt: &[u8]) -> Result<String, JsValue> {
    let derived = derive_key(password, salt)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(hex_encode(&derived))
}

/// Generate a random password.
/// `password_type`: "passphrase" for word-based, anything else for random characters.
#[wasm_bindgen]
pub fn generate_password(length: u32, password_type: &str) -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    match password_type {
        "passphrase" => {
            let word_count = (length / 5).clamp(4, 12);
            let words: Vec<&str> = (0..word_count)
                .map(|_| {
                    let idx = rng.gen_range(0..PASSPHRASE_WORDS.len());
                    PASSPHRASE_WORDS[idx]
                })
                .collect();
            words.join("-")
        }
        _ => {
            let len = length.clamp(12, 128) as usize;
            (0..len)
                .map(|_| {
                    let idx = rng.gen_range(0..ALPHA_CHARS.len());
                    ALPHA_CHARS[idx] as char
                })
                .collect()
        }
    }
}

/// Decrypt a single feuille's data_blob.
/// The data_blob and nonce are base64-encoded.
/// Returns the decrypted JSON string (title, username, password, url, notes).
#[wasm_bindgen]
pub fn decrypt_feuille(
    saladier_key: &[u8],
    data_blob_b64: &str,
    nonce_b64: &str,
) -> Result<String, JsValue> {
    if saladier_key.len() != 32 {
        return Err(JsValue::from_str("Saladier key must be 32 bytes"));
    }
    let k: &[u8; 32] = saladier_key.try_into().unwrap();
    let b64 = base64::engine::general_purpose::STANDARD;

    let data_blob = b64.decode(data_blob_b64)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {e}")))?;
    let nonce = b64.decode(nonce_b64)
        .map_err(|e| JsValue::from_str(&format!("Nonce decode error: {e}")))?;

    let cipher = XChaCha20Poly1305::new_from_slice(k)
        .map_err(|e| JsValue::from_str(&format!("Cipher error: {e}")))?;
    let xnonce = XNonce::from_slice(&nonce);
    let plaintext = cipher
        .decrypt(xnonce, data_blob.as_ref())
        .map_err(|_| JsValue::from_str("Decryption failed"))?;

    String::from_utf8(plaintext)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 error: {e}")))
}

/// Decrypt a saladier name (base64-encoded name_enc + nonce).
#[wasm_bindgen]
pub fn decrypt_saladier_name(
    master_key: &[u8],
    name_enc_b64: &str,
    nonce_b64: &str,
) -> Result<String, JsValue> {
    if master_key.len() != 32 {
        return Err(JsValue::from_str("Master key must be 32 bytes"));
    }
    let k: &[u8; 32] = master_key.try_into().unwrap();
    let b64 = base64::engine::general_purpose::STANDARD;

    let name_enc = b64.decode(name_enc_b64)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {e}")))?;
    let nonce = b64.decode(nonce_b64)
        .map_err(|e| JsValue::from_str(&format!("Nonce decode error: {e}")))?;

    let cipher = XChaCha20Poly1305::new_from_slice(k)
        .map_err(|e| JsValue::from_str(&format!("Cipher error: {e}")))?;
    let xnonce = XNonce::from_slice(&nonce);
    let plaintext = cipher
        .decrypt(xnonce, name_enc.as_ref())
        .map_err(|_| JsValue::from_str("Decryption failed"))?;

    String::from_utf8(plaintext)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 error: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = b"Hello, SaladVault!";
        let packed = encrypt_raw(&key, plaintext).unwrap();
        let decrypted = decrypt_raw(&key, &packed).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        let key = [42u8; 32];
        let wrong_key = [99u8; 32];
        let packed = encrypt_raw(&key, b"Secret").unwrap();
        assert!(decrypt_raw(&wrong_key, &packed).is_err());
    }

    #[test]
    fn test_blind_index_deterministic() {
        let idx1 = compute_blind_index_inner("user@example.com", EMAIL_BLIND_INDEX_SALT, PEPPER_SEED).unwrap();
        let idx2 = compute_blind_index_inner("user@example.com", EMAIL_BLIND_INDEX_SALT, PEPPER_SEED).unwrap();
        assert_eq!(idx1, idx2);
    }

    #[test]
    fn test_blind_index_case_insensitive() {
        let idx1 = compute_blind_index_inner("User@Example.COM", EMAIL_BLIND_INDEX_SALT, PEPPER_SEED).unwrap();
        let idx2 = compute_blind_index_inner("user@example.com", EMAIL_BLIND_INDEX_SALT, PEPPER_SEED).unwrap();
        assert_eq!(idx1, idx2);
    }

    #[test]
    fn test_generate_password_length() {
        let pwd = generate_password(20, "random");
        assert_eq!(pwd.len(), 20);
    }

    #[test]
    fn test_generate_passphrase() {
        let pp = generate_password(30, "passphrase");
        let words: Vec<&str> = pp.split('-').collect();
        assert!(words.len() >= 4);
    }
}
