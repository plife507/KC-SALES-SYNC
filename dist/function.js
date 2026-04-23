import { DEFAULT_SAMPLE_LIMIT, runtimeConfig } from "./config.js";
import { runSample, runSheetInit, runSync } from "./index.js";
function parseBody(req) {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }
    return {};
}
export async function kcSalesSync(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
    }
    try {
        const body = parseBody(req);
        const command = body.command ?? "sync";
        if (command === "sheet:init") {
            const result = await runSheetInit(body.title ?? runtimeConfig.sheetTitle);
            res.status(200).json(result);
            return;
        }
        if (command === "sample") {
            if (!runtimeConfig.runtime.allowDebugCommands) {
                res.status(403).json({ error: "sample is disabled in this runtime. Enable ALLOW_DEBUG_COMMANDS=true to use it." });
                return;
            }
            const result = await runSample(body.limit ?? DEFAULT_SAMPLE_LIMIT);
            res.status(200).json(result);
            return;
        }
        const result = await runSync({
            spreadsheetId: body.spreadsheetId,
            tabName: body.tabName,
            limit: body.limit,
            pageSize: body.pageSize,
        });
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
