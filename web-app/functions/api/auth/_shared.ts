const ADMIN_COOKIE_NAME = "team_dream_admin";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AuthEnv {
  TEAM_DREAM_ADMIN_ID?: string;
  TEAM_DREAM_ADMIN_PASSWORD?: string;
  TEAM_DREAM_AUTH_SECRET?: string;
}

interface AdminSessionPayload {
  role: "admin";
  iat: number;
  exp: number;
}

export function adminAuthConfigured(env: AuthEnv): boolean {
  return Boolean(env.TEAM_DREAM_ADMIN_ID?.trim() && env.TEAM_DREAM_ADMIN_PASSWORD?.trim());
}

export function credentialsMatch(env: AuthEnv, id: string, password: string): boolean {
  return id === env.TEAM_DREAM_ADMIN_ID?.trim() && password === env.TEAM_DREAM_ADMIN_PASSWORD;
}

export async function createAdminSessionCookie(env: AuthEnv, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: AdminSessionPayload = {
    role: "admin",
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, sessionSecret(env));

  return [
    `${ADMIN_COOKIE_NAME}=${encodedPayload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ");
}

export function expiredAdminSessionCookie(): string {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export async function verifyAdminRequest(request: Request, env: AuthEnv, now = new Date()): Promise<boolean> {
  if (!adminAuthConfigured(env)) return false;

  const token = cookieValue(request.headers.get("Cookie") || "", ADMIN_COOKIE_NAME);
  if (!token) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = await sign(encodedPayload, sessionSecret(env));
  if (signature !== expectedSignature) return false;

  const payload = parsePayload(encodedPayload);
  if (!payload || payload.role !== "admin") return false;

  return payload.exp > Math.floor(now.getTime() / 1000);
}

function parsePayload(encodedPayload: string): AdminSessionPayload | null {
  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;
  } catch {
    return null;
  }
}

function sessionSecret(env: AuthEnv): string {
  return env.TEAM_DREAM_AUTH_SECRET?.trim() || env.TEAM_DREAM_ADMIN_PASSWORD || "team-dream-dev-secret";
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function cookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((candidate) => candidate.startsWith(prefix));

  return cookie ? cookie.slice(prefix.length) : null;
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
