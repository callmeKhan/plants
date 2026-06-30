const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function keyToArrayBuffer(key: ArrayBuffer | Uint8Array | string) {
  if (typeof key === "string") return bytesToArrayBuffer(encoder.encode(key));
  if (key instanceof ArrayBuffer) return key;
  return bytesToArrayBuffer(key);
}

async function hmac(key: ArrayBuffer | Uint8Array | string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyToArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(date: Date) {
  return amzDate(date).slice(0, 8);
}

function encodePathKey(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
    .join("&");
}

async function signingKey(secretAccessKey: string, date: string) {
  const kDate = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

export interface R2PresignInput {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  expiresInSeconds?: number;
}

interface R2PutPresignInput extends R2PresignInput {
  contentType: string;
}

async function createR2PresignedUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  key,
  expiresInSeconds = 900,
  method,
  signedHeaders,
  canonicalHeaders,
}: R2PresignInput & {
  method: "PUT" | "DELETE";
  signedHeaders: string;
  canonicalHeaders: string;
}) {
  const now = new Date();
  const requestDate = amzDate(now);
  const requestDateStamp = dateStamp(now);
  const credentialScope = `${requestDateStamp}/auto/s3/aws4_request`;
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePathKey(key)}`;

  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": requestDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQueryString = canonicalQuery(queryParams);
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const keyBytes = await signingKey(secretAccessKey, requestDateStamp);
  const signature = toHex(await hmac(keyBytes, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function createR2PutPresignedUrl(input: R2PutPresignInput) {
  const host = `${input.bucketName}.${input.accountId}.r2.cloudflarestorage.com`;
  return createR2PresignedUrl({
    ...input,
    method: "PUT",
    signedHeaders: "content-type;host",
    canonicalHeaders: `content-type:${input.contentType}\nhost:${host}\n`,
  });
}

export async function createR2DeletePresignedUrl(input: R2PresignInput) {
  const host = `${input.bucketName}.${input.accountId}.r2.cloudflarestorage.com`;
  return createR2PresignedUrl({
    ...input,
    method: "DELETE",
    signedHeaders: "host",
    canonicalHeaders: `host:${host}\n`,
  });
}
