import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  EncryptedPayloadSchema,
  PairEncryptedPayloadSchema,
  type EncryptedPayload,
  type PairResponse,
} from "codex-relay/api-schema";
import { fromByteArray, toByteArray } from "base64-js";

const secureProtocolVersion = 1;
const handshakeTag = "codex-relay-e2ee-v1";
const secureSessionStorageKey = "codex-relay.web.secure-session";

export type SecurePairingAttempt = {
  approvalCode?: string;
  clientEphemeralPrivateKey: Uint8Array;
  clientEphemeralPublicKey: string;
  clientNonce: string;
  serverPublicKey: string;
  serverUrl: string;
};

type SecureSession = {
  keyEpoch: number;
  lastServerCounter: number;
  mobileToServerKey: Uint8Array;
  nextMobileCounter: number;
  serverToMobileKey: Uint8Array;
};

type StoredSecureSession = {
  keyEpoch: number;
  lastServerCounter: number;
  mobileToServerKey: string;
  nextMobileCounter: number;
  serverToMobileKey: string;
};

export function createSecurePairingAttempt(input: {
  serverPublicKey: string;
  serverUrl: string;
}): SecurePairingAttempt {
  const clientEphemeralPrivateKey = x25519.utils.randomSecretKey();
  return {
    clientEphemeralPrivateKey,
    clientEphemeralPublicKey: bytesToBase64(x25519.getPublicKey(clientEphemeralPrivateKey)),
    clientNonce: bytesToBase64(randomBytes(32)),
    serverPublicKey: input.serverPublicKey,
    serverUrl: input.serverUrl,
  };
}

export function attachApprovalCode(attempt: SecurePairingAttempt, approvalCode: string) {
  attempt.approvalCode = approvalCode;
}

export function completeSecurePairing(attempt: SecurePairingAttempt, response: PairResponse) {
  if (!response.secure) {
    throw new Error("Server did not return a secure pairing response.");
  }

  const transcript = pairingTranscript({
    approvalCode: attempt.approvalCode ?? "",
    clientEphemeralPublicKey: attempt.clientEphemeralPublicKey,
    clientNonce: attempt.clientNonce,
    keyEpoch: response.secure.keyEpoch,
    serverEphemeralPublicKey: response.secure.serverEphemeralPublicKey,
    serverIdentityPublicKey: attempt.serverPublicKey,
    serverNonce: response.secure.serverNonce,
    serverUrl: attempt.serverUrl,
  });

  const signatureValid = ed25519.verify(
    base64ToBytes(response.secure.serverSignature),
    transcript,
    base64ToBytes(attempt.serverPublicKey),
  );
  if (!signatureValid) {
    throw new Error("Server secure pairing signature did not match the pasted pairing link.");
  }

  const sharedSecret = x25519.getSharedSecret(
    attempt.clientEphemeralPrivateKey,
    base64ToBytes(response.secure.serverEphemeralPublicKey),
  );
  const session = deriveSession(sharedSecret, transcript, response.secure.keyEpoch);
  const decrypted = decryptWithKey(
    session.serverToMobileKey,
    "server",
    0,
    response.secure.encryptedPayload,
  );
  const payload = PairEncryptedPayloadSchema.parse(JSON.parse(decrypted));
  saveSecureSession(session);
  return payload;
}

export function encryptRequestPayload(payload: unknown) {
  const session = readSecureSession();
  if (!session) {
    return JSON.stringify(payload);
  }

  const envelope = encryptWithKey(
    session.mobileToServerKey,
    "mobile",
    session.keyEpoch,
    session.nextMobileCounter,
    JSON.stringify(payload),
  );
  session.nextMobileCounter += 1;
  saveSecureSession(session);
  return JSON.stringify(EncryptedPayloadSchema.parse(envelope));
}

export function decryptResponsePayload(payload: unknown) {
  const session = readSecureSession();
  const envelope = EncryptedPayloadSchema.safeParse(payload);
  if (!session || !envelope.success) {
    return payload;
  }
  if (
    envelope.data.sender !== "server" ||
    envelope.data.keyEpoch !== session.keyEpoch ||
    envelope.data.counter <= session.lastServerCounter
  ) {
    throw new Error("Server returned an invalid encrypted payload.");
  }

  const decrypted = decryptWithKey(
    session.serverToMobileKey,
    "server",
    envelope.data.counter,
    envelope.data.ciphertext,
  );
  session.lastServerCounter = envelope.data.counter;
  saveSecureSession(session);
  return JSON.parse(decrypted) as unknown;
}

export function clearSecureSession() {
  localStorage.removeItem(secureSessionStorageKey);
}

function deriveSession(
  sharedSecret: Uint8Array,
  transcript: Uint8Array,
  keyEpoch: number,
): SecureSession {
  const salt = sha256(transcript);
  const infoPrefix = `${handshakeTag}|${keyEpoch}|${bytesToBase64(sha256(transcript))}`;
  return {
    keyEpoch,
    lastServerCounter: 0,
    mobileToServerKey: hkdf(
      sha256,
      sharedSecret,
      salt,
      utf8ToBytes(`${infoPrefix}|mobileToServer`),
      32,
    ),
    nextMobileCounter: 0,
    serverToMobileKey: hkdf(
      sha256,
      sharedSecret,
      salt,
      utf8ToBytes(`${infoPrefix}|serverToMobile`),
      32,
    ),
  };
}

function pairingTranscript(input: {
  approvalCode: string;
  clientEphemeralPublicKey: string;
  clientNonce: string;
  keyEpoch: number;
  serverEphemeralPublicKey: string;
  serverIdentityPublicKey: string;
  serverNonce: string;
  serverUrl: string;
}) {
  return utf8ToBytes(
    JSON.stringify({
      tag: handshakeTag,
      approvalCode: input.approvalCode,
      clientEphemeralPublicKey: input.clientEphemeralPublicKey,
      clientNonce: input.clientNonce,
      keyEpoch: input.keyEpoch,
      serverEphemeralPublicKey: input.serverEphemeralPublicKey,
      serverIdentityPublicKey: input.serverIdentityPublicKey,
      serverNonce: input.serverNonce,
      serverUrl: input.serverUrl,
    }),
  );
}

function encryptWithKey(
  key: Uint8Array,
  sender: "mobile" | "server",
  keyEpoch: number,
  counter: number,
  plaintext: string,
): EncryptedPayload {
  const ciphertext = gcm(key, nonceFor(sender, counter)).encrypt(utf8ToBytes(plaintext));
  return {
    ciphertext: bytesToBase64(ciphertext),
    counter,
    keyEpoch,
    protocolVersion: secureProtocolVersion,
    sender,
  };
}

function decryptWithKey(
  key: Uint8Array,
  sender: "mobile" | "server",
  counter: number,
  ciphertext: string,
) {
  const plaintext = gcm(key, nonceFor(sender, counter)).decrypt(base64ToBytes(ciphertext));
  return utf8FromBytes(plaintext);
}

function nonceFor(sender: "mobile" | "server", counter: number) {
  const nonce = new Uint8Array(12);
  nonce[0] = sender === "mobile" ? 1 : 2;
  new DataView(nonce.buffer).setBigUint64(4, BigInt(counter), false);
  return nonce;
}

function saveSecureSession(session: SecureSession) {
  const stored: StoredSecureSession = {
    keyEpoch: session.keyEpoch,
    lastServerCounter: session.lastServerCounter,
    mobileToServerKey: bytesToBase64(session.mobileToServerKey),
    nextMobileCounter: session.nextMobileCounter,
    serverToMobileKey: bytesToBase64(session.serverToMobileKey),
  };
  localStorage.setItem(secureSessionStorageKey, JSON.stringify(stored));
}

function readSecureSession() {
  const stored = localStorage.getItem(secureSessionStorageKey);
  if (!stored) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredSecureSession>;
    if (
      typeof parsed.keyEpoch !== "number" ||
      typeof parsed.mobileToServerKey !== "string" ||
      typeof parsed.serverToMobileKey !== "string"
    ) {
      return undefined;
    }

    return {
      keyEpoch: parsed.keyEpoch,
      lastServerCounter: parsed.lastServerCounter ?? 0,
      mobileToServerKey: base64ToBytes(parsed.mobileToServerKey),
      nextMobileCounter: parsed.nextMobileCounter ?? 0,
      serverToMobileKey: base64ToBytes(parsed.serverToMobileKey),
    };
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  return fromByteArray(bytes);
}

function base64ToBytes(value: string) {
  return toByteArray(value);
}

function utf8ToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function utf8FromBytes(value: Uint8Array) {
  return new TextDecoder().decode(value);
}
