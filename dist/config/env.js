import { DEFAULT_JOBBER_API_URL, DEFAULT_JOBBER_API_VERSION, DEFAULT_JOBBER_NOTES_PAGE_SIZE, DEFAULT_JOBBER_REQUEST_DELAY_MS, DEFAULT_QUOTE_LIMIT, DEFAULT_QUOTE_PAGE_SIZE, DEFAULT_SHEET_TAB, DEFAULT_SHEET_TITLE, } from "./constants.js";
function env(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
function envNumber(name, fallback) {
    const value = env(name);
    if (!value)
        return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric env: ${name}=${value}`);
    }
    return parsed;
}
function envBoolean(name, fallback) {
    const value = env(name);
    if (!value)
        return fallback;
    if (["1", "true", "yes", "on"].includes(value.toLowerCase()))
        return true;
    if (["0", "false", "no", "off"].includes(value.toLowerCase()))
        return false;
    throw new Error(`Invalid boolean env: ${name}=${value}`);
}
function envList(name) {
    const value = env(name);
    if (!value)
        return undefined;
    const items = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length > 0 ? items : undefined;
}
export function requireEnv(name) {
    const value = env(name);
    if (!value)
        throw new Error(`Missing required env: ${name}`);
    return value;
}
const isCloudRun = Boolean(env("K_SERVICE"));
const configuredTabNames = envList("SHEET_TABS");
const defaultTabName = env("SHEET_TAB") ?? DEFAULT_SHEET_TAB;
const syncTabNames = configuredTabNames ?? [defaultTabName];
export const runtimeConfig = {
    sheetTitle: DEFAULT_SHEET_TITLE,
    defaultTabName: DEFAULT_SHEET_TAB,
    defaultQuoteLimit: DEFAULT_QUOTE_LIMIT,
    defaultQuotePageSize: DEFAULT_QUOTE_PAGE_SIZE,
    spreadsheetId: env("SPREADSHEET_ID"),
    jobber: {
        accessToken: env("JOBBER_ACCESS_TOKEN"),
        clientId: env("JOBBER_CLIENT_ID"),
        clientSecret: env("JOBBER_CLIENT_SECRET"),
        refreshToken: env("JOBBER_REFRESH_TOKEN"),
        apiUrl: env("JOBBER_API_URL") ?? DEFAULT_JOBBER_API_URL,
        apiVersion: env("JOBBER_API_VERSION") ?? DEFAULT_JOBBER_API_VERSION,
        requestDelayMs: envNumber("JOBBER_REQUEST_DELAY_MS", DEFAULT_JOBBER_REQUEST_DELAY_MS),
        notesPageSize: envNumber("JOBBER_NOTES_PAGE_SIZE", DEFAULT_JOBBER_NOTES_PAGE_SIZE),
    },
    google: {
        gogAccount: env("GOG_ACCOUNT"),
        gogCredentialsPath: env("GOG_CREDENTIALS_PATH"),
        clientId: env("GOOGLE_CLIENT_ID"),
        clientSecret: env("GOOGLE_CLIENT_SECRET"),
        refreshToken: env("GOOGLE_REFRESH_TOKEN"),
    },
    runtime: {
        isCloudRun,
        allowDebugCommands: envBoolean("ALLOW_DEBUG_COMMANDS", false),
        allowLocalSheetsFallback: envBoolean("ALLOW_LOCAL_SHEETS_FALLBACK", !isCloudRun),
    },
    sync: {
        tabName: syncTabNames[0] ?? DEFAULT_SHEET_TAB,
        tabNames: syncTabNames,
        quoteLimit: envNumber("QUOTE_LIMIT", DEFAULT_QUOTE_LIMIT),
        quotePageSize: envNumber("QUOTE_PAGE_SIZE", DEFAULT_QUOTE_PAGE_SIZE),
    },
};
