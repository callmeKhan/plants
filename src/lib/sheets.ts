/**
 * Google Sheets client — Workers-compatible (no googleapis).
 * Uses Web Crypto API for JWT signing + direct REST API calls.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   GOOGLE_SHEET_ID
 */

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function isSheetsConfigured(): boolean {
  return !!(SHEET_ID && SERVICE_EMAIL && PRIVATE_KEY);
}

// --- JWT Auth (Web Crypto) ---

let cachedToken: { token: string; expiry: number } | null = null;

function base64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiry > now + 60) {
    return cachedToken.token;
  }

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: SERVICE_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await importPrivateKey(PRIVATE_KEY!);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  const jwt = `${header}.${payload}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiry: now + data.expires_in };
  return data.access_token;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// --- Sheets CRUD ---

export async function readSheet(sheetName: string): Promise<string[][]> {
  const headers = await authHeaders();
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`readSheet failed: ${res.status}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

export async function appendRow(sheetName: string, values: string[]): Promise<void> {
  const headers = await authHeaders();
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`appendRow failed: ${res.status}`);
}

export async function updateRow(
  sheetName: string,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const headers = await authHeaders();
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`;
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`updateRow failed: ${res.status}`);
}

export async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  const headers = await authHeaders();

  // Get sheet's gid
  const metaUrl = `${SHEETS_BASE}/${SHEET_ID}?fields=sheets.properties`;
  const metaRes = await fetch(metaUrl, { headers });
  if (!metaRes.ok) throw new Error(`deleteRow meta failed: ${metaRes.status}`);

  const meta = (await metaRes.json()) as {
    sheets: { properties: { title: string; sheetId: number } }[];
  };
  const sheet = meta.sheets.find((s) => s.properties.title === sheetName);
  if (!sheet) return;

  const url = `${SHEETS_BASE}/${SHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`deleteRow failed: ${res.status}`);
}
