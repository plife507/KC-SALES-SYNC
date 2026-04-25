import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { google } from "googleapis";
import { runtimeConfig, NO_NOTE_TEXT } from "./config.js";
const execFileAsync = promisify(execFile);
const DEFAULT_DASHBOARD_TAB = "Draft Quote Sales Touch";
const DEFAULT_OUTPUT_PATH = join(process.cwd(), "dashboard", "data", "live-data.json");
function env(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
function parseArgs(argv) {
    const args = [...argv];
    let outputPath = DEFAULT_OUTPUT_PATH;
    let tabName = env("DASHBOARD_SHEET_TAB") ?? DEFAULT_DASHBOARD_TAB;
    let spreadsheetId = runtimeConfig.spreadsheetId;
    while (args.length > 0) {
        const arg = args.shift();
        if (!arg)
            continue;
        if (arg === "--out")
            outputPath = args.shift() ?? outputPath;
        else if (arg === "--tab")
            tabName = args.shift() ?? tabName;
        else if (arg === "--spreadsheet")
            spreadsheetId = args.shift() ?? spreadsheetId;
    }
    if (!spreadsheetId) {
        throw new Error("Missing spreadsheet id. Set SPREADSHEET_ID or pass --spreadsheet.");
    }
    return { outputPath, tabName, spreadsheetId };
}
async function buildGoogleAuth() {
    const { clientId, clientSecret, refreshToken, gogCredentialsPath, gogAccount } = runtimeConfig.google;
    if (clientId && clientSecret && refreshToken) {
        const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
        oauth2.setCredentials({ refresh_token: refreshToken });
        return oauth2;
    }
    if (!runtimeConfig.runtime.allowLocalSheetsFallback) {
        throw new Error("Missing direct Google auth env for this runtime. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN.");
    }
    const credentialsPath = gogCredentialsPath ?? join(homedir(), ".config", "gogcli", "credentials.json");
    const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
    const tempTokenPath = `/tmp/gog-token-${process.pid}-${Date.now()}.json`;
    if (!gogAccount) {
        throw new Error("Missing Google auth env. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN or GOG_ACCOUNT.");
    }
    await execFileAsync("gog", ["auth", "tokens", "export", gogAccount, "--out", tempTokenPath, "--overwrite", "--no-input"], {
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
    });
    try {
        const token = JSON.parse(await readFile(tempTokenPath, "utf8"));
        const oauth2 = new google.auth.OAuth2(credentials.client_id, credentials.client_secret);
        oauth2.setCredentials({ refresh_token: token.refresh_token });
        return oauth2;
    }
    finally {
        await import("node:fs/promises").then((fs) => fs.rm(tempTokenPath, { force: true }));
    }
}
function sheetRange(tabName, range) {
    return `'${tabName.replace(/'/g, "''")}'!${range}`;
}
async function fetchSheetValues(spreadsheetId, tabName) {
    const auth = await buildGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetRange(tabName, "A:O"),
        valueRenderOption: "FORMULA",
    });
    return (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
}
function headerKey(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
function rowsToRecords(values) {
    const [headerRow, ...bodyRows] = values;
    if (!headerRow || headerRow.length === 0)
        return [];
    const keys = headerRow.map(headerKey);
    return bodyRows
        .filter((row) => row.some((cell) => cell.trim().length > 0))
        .map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index] ?? ""])));
}
function extractHyperlinkParts(value) {
    const match = value.match(/^=HYPERLINK\("([^"]+)","([^"]*)"\)$/i);
    if (!match) {
        return { label: value, url: "" };
    }
    return { url: match[1] ?? "", label: match[2] ?? "" };
}
function parsePacificDisplay(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed.replace(/\bPDT\b/g, "GMT-0700").replace(/\bPST\b/g, "GMT-0800");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}
function daysSinceTouch(lastTouchAt, now = new Date()) {
    const touchedAt = parsePacificDisplay(lastTouchAt);
    if (!touchedAt)
        return null;
    const diffMs = now.getTime() - touchedAt.getTime();
    return Math.max(0, Math.floor(diffMs / 86400000));
}
function summarizeNote(text, maxLength = 220) {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed)
        return NO_NOTE_TEXT;
    if (trimmed.length <= maxLength)
        return trimmed;
    return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}
function normalizeOwnerName(value) {
    const trimmed = value.trim();
    return trimmed || "Unassigned";
}
function bucketForDays(days) {
    if (days === null)
        return "overdue";
    if (days > 10)
        return "overdue";
    if (days >= 6)
        return "stale";
    if (days >= 3)
        return "attention";
    return "fresh";
}
function statusLabel(bucket) {
    if (bucket === "overdue")
        return "Overdue 11+ days";
    if (bucket === "stale")
        return "Stale 6–10 days";
    if (bucket === "attention")
        return "Needs touch 3–5 days";
    return "Fresh 0–2 days";
}
function toneSortValue(bucket) {
    if (bucket === "overdue")
        return 0;
    if (bucket === "stale")
        return 1;
    if (bucket === "attention")
        return 2;
    return 3;
}
function repSummaryNote(repName, rows) {
    const overdue = rows.filter((row) => row.rowTone === "overdue");
    const stale = rows.filter((row) => row.rowTone === "stale");
    const attention = rows.filter((row) => row.rowTone === "attention");
    const oldest = rows.reduce((max, row) => {
        if (row.daysSinceTouch == null)
            return max;
        return max == null ? row.daysSinceTouch : Math.max(max, row.daysSinceTouch);
    }, null);
    if (repName === "Unassigned") {
        return overdue.length > 0
            ? "Useful catch-all card so orphaned quotes don’t disappear into the sheet."
            : "Fresh orphaned quotes are visible here before they quietly age out.";
    }
    if (overdue.length >= 3) {
        return `Oldest quote is ${oldest ?? "?"} days untouched. This rep card should stay near the top until the red bucket shrinks.`;
    }
    if (overdue.length >= 1) {
        return stale.length > overdue.length
            ? "This card reads more like manageable drift than emergency — still useful for coaching and follow-up pacing."
            : "Smaller volume, but the concentration of overdue quotes makes this rep card red-flag worthy.";
    }
    if (attention.length >= 1) {
        return "This rep has quotes entering the follow-up window soon, but not yet in the older stale buckets.";
    }
    return "Mostly fresh pipeline right now, with enough context in notes to coach without opening every quote.";
}
function buildDashboard(records, spreadsheetId, tabName) {
    const rows = records.map((record) => {
        const quote = extractHyperlinkParts(record.quote_number ?? "");
        const client = extractHyperlinkParts(record.client_name ?? "");
        const repName = normalizeOwnerName(record.native_salesperson ?? "");
        const lastTouchAt = record.last_sales_touch_at ?? "";
        const noteText = record.last_note_text ?? "";
        const noNote = noteText.trim() === "" || noteText.trim() === NO_NOTE_TEXT;
        const days = daysSinceTouch(lastTouchAt);
        const tone = noNote && days === null ? "overdue" : bucketForDays(days);
        return {
            quoteNumber: quote.label || record.quote_number || "",
            quoteUrl: quote.url,
            quoteTitle: record.quote_title ?? "",
            clientName: client.label || record.client_name || "",
            clientUrl: client.url,
            repName,
            nativeSalesperson: record.kc_sales_rep ?? "",
            leadSource: record.lead_source ?? "",
            status: statusLabel(tone),
            quoteStatus: record.quote_status ?? "",
            daysSinceTouch: days,
            lastTouchAt,
            lastTouchBy: record.last_sales_touch_by ?? "",
            lastNoteSummary: summarizeNote(noteText),
            rowTone: tone,
            missingOwner: repName === "Unassigned",
            hasNoNote: noNote,
        };
    });
    rows.sort((a, b) => {
        const toneDiff = toneSortValue(a.rowTone) - toneSortValue(b.rowTone);
        if (toneDiff !== 0)
            return toneDiff;
        const dayA = a.daysSinceTouch ?? Number.MAX_SAFE_INTEGER;
        const dayB = b.daysSinceTouch ?? Number.MAX_SAFE_INTEGER;
        if (dayA !== dayB)
            return dayB - dayA;
        return a.repName.localeCompare(b.repName) || a.quoteNumber.localeCompare(b.quoteNumber);
    });
    const metrics = {
        totalDrafts: rows.length,
        overdue: rows.filter((row) => row.rowTone === "overdue").length,
        stale: rows.filter((row) => row.rowTone === "stale").length,
        attention: rows.filter((row) => row.rowTone === "attention").length,
        fresh: rows.filter((row) => row.rowTone === "fresh").length,
        unassigned: rows.filter((row) => row.missingOwner).length,
        noNote: rows.filter((row) => row.hasNoNote).length,
    };
    const leadSources = [...new Set(rows.map((row) => row.leadSource.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    const repNames = [...new Set(rows.map((row) => row.repName))]
        .sort((a, b) => {
        if (a === "Unassigned")
            return 1;
        if (b === "Unassigned")
            return -1;
        return a.localeCompare(b);
    });
    const summary = {
        oldestTouchDays: rows.reduce((max, row) => {
            if (row.daysSinceTouch == null)
                return max;
            return max == null ? row.daysSinceTouch : Math.max(max, row.daysSinceTouch);
        }, null),
        rowsWithNoTouch: rows.filter((row) => row.daysSinceTouch == null).length,
        uniqueLeadSources: leadSources.length,
    };
    const repMap = new Map();
    for (const row of rows) {
        const list = repMap.get(row.repName) ?? [];
        list.push(row);
        repMap.set(row.repName, list);
    }
    const reps = [...repMap.entries()]
        .map(([repName, repRows]) => {
        const overdue = repRows.filter((row) => row.rowTone === "overdue").length;
        const stale = repRows.filter((row) => row.rowTone === "stale").length;
        const attention = repRows.filter((row) => row.rowTone === "attention").length;
        const fresh = repRows.filter((row) => row.rowTone === "fresh").length;
        return {
            repName,
            totalDrafts: repRows.length,
            overdue,
            stale,
            attention,
            fresh,
            scoreLabel: `${overdue} overdue`,
            note: repSummaryNote(repName, repRows),
        };
    })
        .sort((a, b) => {
        if (b.overdue !== a.overdue)
            return b.overdue - a.overdue;
        if (b.stale !== a.stale)
            return b.stale - a.stale;
        if (b.totalDrafts !== a.totalDrafts)
            return b.totalDrafts - a.totalDrafts;
        if (a.repName === "Unassigned")
            return 1;
        if (b.repName === "Unassigned")
            return -1;
        return a.repName.localeCompare(b.repName);
    });
    return {
        generatedAt: new Date().toISOString(),
        spreadsheetId,
        tabName,
        metrics,
        summary,
        repNames,
        leadSources,
        reps,
        rows,
        filters: [
            { key: "all", label: "All drafts" },
            { key: "fresh", label: "Fresh 0–2 days" },
            { key: "attention", label: "Needs touch 3–5 days" },
            { key: "stale", label: "Stale 6–10 days" },
            { key: "overdue", label: "Overdue 11+ days" },
            { key: "unassigned", label: "Unassigned" },
            { key: "no-note", label: "No note" },
        ],
    };
}
export async function buildDashboardData(options) {
    const spreadsheetId = options?.spreadsheetId ?? runtimeConfig.spreadsheetId;
    const tabName = options?.tabName ?? env("DASHBOARD_SHEET_TAB") ?? DEFAULT_DASHBOARD_TAB;
    if (!spreadsheetId)
        throw new Error("Missing spreadsheet id. Set SPREADSHEET_ID.");
    const values = await fetchSheetValues(spreadsheetId, tabName);
    const records = rowsToRecords(values);
    return buildDashboard(records, spreadsheetId, tabName);
}
export async function writeDashboardData(options) {
    const payload = await buildDashboardData({ spreadsheetId: options?.spreadsheetId, tabName: options?.tabName });
    const outputPath = options?.outputPath ?? DEFAULT_OUTPUT_PATH;
    const fs = await import("node:fs/promises");
    await fs.mkdir(dirname(outputPath), { recursive: true });
    const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
    await fs.writeFile(outputPath, jsonText, "utf8");
    const jsOutputPath = outputPath.replace(/\.json$/i, ".js");
    const jsText = `window.__KC_DASHBOARD_DATA__ = ${JSON.stringify(payload, null, 2)};\n`;
    await fs.writeFile(jsOutputPath, jsText, "utf8");
    return {
        outputPath,
        jsOutputPath,
        rowCount: payload.rows.length,
        repCount: payload.reps.length,
        generatedAt: payload.generatedAt,
        tabName: payload.tabName,
        spreadsheetId: payload.spreadsheetId,
    };
}
async function main() {
    const { outputPath, tabName, spreadsheetId } = parseArgs(process.argv.slice(2));
    const result = await writeDashboardData({ outputPath, tabName, spreadsheetId });
    console.log(JSON.stringify(result, null, 2));
}
function isDirectRun() {
    const entrypoint = process.argv[1];
    if (!entrypoint)
        return false;
    return import.meta.url === new URL(`file://${entrypoint}`).href;
}
if (isDirectRun()) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
