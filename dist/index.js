import { DEFAULT_SAMPLE_LIMIT, requireEnv, runtimeConfig } from "./config.js";
import { fetchDraftQuotes } from "./adapters/jobber.js";
import { ensureSpreadsheet, logSyncResult, writeRows } from "./adapters/sheets.js";
import { quoteToSheetRow, rowsToSheetValues } from "./lib/touch.js";
export async function runSheetInit(title = runtimeConfig.sheetTitle) {
    return ensureSpreadsheet(title);
}
export async function runSync(options) {
    const startedAt = Date.now();
    let spreadsheetId;
    let targetTabNames = [];
    try {
        spreadsheetId = options?.spreadsheetId ?? runtimeConfig.spreadsheetId ?? requireEnv("SPREADSHEET_ID");
        targetTabNames = options?.tabName ? [options.tabName] : runtimeConfig.sync.tabNames;
        const limit = options?.limit ?? runtimeConfig.sync.quoteLimit;
        const pageSize = options?.pageSize ?? runtimeConfig.sync.quotePageSize;
        const quotes = await fetchDraftQuotes(limit, pageSize);
        const rows = quotes.map(quoteToSheetRow);
        const values = rowsToSheetValues(rows);
        for (const tabName of targetTabNames) {
            await writeRows(spreadsheetId, tabName, values);
        }
        const elapsed = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
        await logSyncResult(spreadsheetId, {
            timestamp: new Date().toISOString(),
            command: "sync",
            tabNames: targetTabNames,
            status: "✅ OK",
            quoteCount: rows.length,
            elapsed,
            error: "",
        }).catch((error) => {
            console.warn(`Sync log write failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return {
            spreadsheetId,
            tabNames: targetTabNames,
            rowCount: rows.length,
            pageSize,
            elapsed,
            status: "ok",
        };
    }
    catch (error) {
        if (spreadsheetId) {
            const elapsed = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
            await logSyncResult(spreadsheetId, {
                timestamp: new Date().toISOString(),
                command: "sync",
                tabNames: targetTabNames.length > 0 ? targetTabNames : [runtimeConfig.sync.tabName],
                status: "🔴 FAILED",
                quoteCount: 0,
                elapsed,
                error: error instanceof Error ? error.message : String(error),
            }).catch((logError) => {
                console.warn(`Sync failure log write failed: ${logError instanceof Error ? logError.message : String(logError)}`);
            });
        }
        throw error;
    }
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
