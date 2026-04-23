import { DEFAULT_SAMPLE_LIMIT, requireEnv, runtimeConfig } from "./config.js";
import { fetchDraftQuotes } from "./adapters/jobber.js";
import { ensureSpreadsheet, writeRows } from "./adapters/sheets.js";
import { quoteToSheetRow, rowsToSheetValues } from "./lib/touch.js";
export async function runSheetInit(title = runtimeConfig.sheetTitle) {
    return ensureSpreadsheet(title);
}
export async function runSync(options) {
    const spreadsheetId = options?.spreadsheetId ?? runtimeConfig.spreadsheetId ?? requireEnv("SPREADSHEET_ID");
    const targetTabNames = options?.tabName ? [options.tabName] : runtimeConfig.sync.tabNames;
    const limit = options?.limit ?? runtimeConfig.sync.quoteLimit;
    const pageSize = options?.pageSize ?? runtimeConfig.sync.quotePageSize;
    const quotes = await fetchDraftQuotes(limit, pageSize);
    const rows = quotes.map(quoteToSheetRow);
    const values = rowsToSheetValues(rows);
    for (const tabName of targetTabNames) {
        await writeRows(spreadsheetId, tabName, values);
    }
    return {
        spreadsheetId,
        tabNames: targetTabNames,
        rowCount: rows.length,
        pageSize,
        status: "ok",
    };
}
export async function runSample(limit = DEFAULT_SAMPLE_LIMIT) {
    const quotes = await fetchDraftQuotes(limit);
    return quotes.map(quoteToSheetRow);
}
export async function runCommand(command) {
    if (command === "sheet:init") {
        return runSheetInit(process.argv[3] ?? runtimeConfig.sheetTitle);
    }
    if (command === "sync") {
        return runSync();
    }
    if (command === "sample") {
        if (!runtimeConfig.runtime.allowDebugCommands) {
            throw new Error("sample is disabled in this runtime. Enable ALLOW_DEBUG_COMMANDS=true to use it.");
        }
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
