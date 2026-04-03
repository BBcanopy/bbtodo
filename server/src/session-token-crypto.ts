import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import {
  deserializeOidcOAuthToken,
  serializeOidcOAuthToken,
  type OidcOAuthToken
} from "./oidc.js";

const SESSION_TOKEN_CIPHER_VERSION = "v1";
const SESSION_TOKEN_IV_BYTES = 12;

export function deriveSessionTokenEncryptionKey(sessionSecret: string) {
  return createHash("sha256")
    .update(`bbtodo-session-token:${sessionSecret}`)
    .digest();
}

export function encryptSessionToken(token: OidcOAuthToken, encryptionKey: Buffer) {
  const iv = randomBytes(SESSION_TOKEN_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(serializeOidcOAuthToken(token), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SESSION_TOKEN_CIPHER_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptSessionToken(rawToken: string, encryptionKey: Buffer) {
  const [version, rawIv, rawAuthTag, rawCiphertext] = rawToken.split(".");
  if (
    version !== SESSION_TOKEN_CIPHER_VERSION ||
    !rawIv ||
    !rawAuthTag ||
    !rawCiphertext
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(rawIv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(rawAuthTag, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(rawCiphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");

    return deserializeOidcOAuthToken(plaintext);
  } catch {
    return null;
  }
}
