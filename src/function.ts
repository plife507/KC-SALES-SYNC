import type { Request, Response } from "@google-cloud/functions-framework";

import { DEFAULT_SHEET_TITLE } from "./config.js";
import { runSample, runSheetInit, runSync } from "./index.js";

type SyncRequestBody = {
  command?: "sync" | "sample" | "sheet:init";
  spreadsheetId?: string;
  tabName?: string;
  limit?: number;
  pageSize?: number;
  title?: string;
};

function parseBody(req: Request): SyncRequestBody {
  if (req.body && typeof req.body === "object") {
    return req.body as SyncRequestBody;
  }
  return {};
}

export async function kcSalesSync(req: Request, res: Response) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = parseBody(req);
    const command = body.command ?? "sync";

    if (command === "sheet:init") {
      const result = await runSheetInit(body.title ?? DEFAULT_SHEET_TITLE);
      res.status(200).json(result);
      return;
    }

    if (command === "sample") {
      const result = await runSample(body.limit ?? 5);
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
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
