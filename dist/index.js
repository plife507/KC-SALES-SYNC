import { DEFAULT_SHEET_TITLE, requireEnv } from "./config.js";
import { fetchDraftQuotes } from "./adapters/jobber.js";
import { ensureSpreadsheet, writeRows } from "./adapters/sheets.js";
import { quoteToSheetRow, rowsToSheetValues } from "./lib/touch.js";
export async function runSheetInit(title = DEFAULT_SHEET_TITLE) {
    return ensureSpreadsheet(title);
}
export async function runSync(options) {
    const spreadsheetId = options?.spreadsheetId ?? requireEnv("SPREADSHEET_ID");
    const tabName = options?.tabName ?? (process.env.SHEET_TAB?.trim() || "DRAFT");
    const limit = options?.limit ?? Number(process.env.QUOTE_LIMIT?.trim() || "100");
    const pageSize = options?.pageSize ?? Number(process.env.QUOTE_PAGE_SIZE?.trim() || "10");
    const quotes = await fetchDraftQuotes(limit, pageSize);
    const rows = quotes.map(quoteToSheetRow);
    const values = rowsToSheetValues(rows);
    await writeRows(spreadsheetId, tabName, values);
    return { spreadsheetId, tabName, rowCount: rows.length, pageSize, status: "ok" };
}
export async function runSample(limit = 5) {
    const quotes = await fetchDraftQuotes(limit);
    return quotes.map(quoteToSheetRow);
}
export async function runCommand(command) {
    if (command === "sheet:init") {
        return runSheetInit(process.argv[3] ?? DEFAULT_SHEET_TITLE);
    }
    if (command === "sync") {
        return runSync();
    }
    if (command === "sample") {
        return runSample(5);
    }
    throw new Error(`Unknown command: ${command}`);
}
async function main() {
    const command = process.argv[2] ?? "sync";
    const result = await runCommand(command);
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
