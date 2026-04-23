export const DEFAULT_SHEET_TITLE = "Draft Quote Sales Touch";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string, fallback: number): number {
  const value = env(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const JOBBER_ACCESS_TOKEN = env("JOBBER_ACCESS_TOKEN");
export const JOBBER_CLIENT_ID = env("JOBBER_CLIENT_ID");
export const JOBBER_CLIENT_SECRET = env("JOBBER_CLIENT_SECRET");
export const JOBBER_REFRESH_TOKEN = env("JOBBER_REFRESH_TOKEN");
export const JOBBER_API_URL = env("JOBBER_API_URL") ?? "https://api.getjobber.com/api/graphql";
export const JOBBER_API_VERSION = env("JOBBER_API_VERSION") ?? "2025-04-16";
export const JOBBER_REQUEST_DELAY_MS = envNumber("JOBBER_REQUEST_DELAY_MS", 400);
export const JOBBER_NOTES_PAGE_SIZE = envNumber("JOBBER_NOTES_PAGE_SIZE", 50);

export const GOG_ACCOUNT = env("GOG_ACCOUNT");
export const GOG_CREDENTIALS_PATH = env("GOG_CREDENTIALS_PATH");
export const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");
export const GOOGLE_REFRESH_TOKEN = env("GOOGLE_REFRESH_TOKEN");

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
