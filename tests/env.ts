// Must be imported first: gives the test process and the spawned server the same JWT key pair,
// so the tests can mint tokens the server accepts (e.g. legacy static ticket QR codes).
import crypto from "node:crypto";

if (!process.env.JWT_PRIVATE_KEY) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
}
process.env.GATE_HS_SECRET_DEFAULT ||= "test-gate-secret";
process.env.HASH_CHAIN_SALT ||= "test-chain-salt";
process.env.RATE_LIMIT_MULTIPLIER ||= "1000";
