import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { google, sheets_v4 } from "googleapis";
import {
  GOG_ACCOUNT,
  GOG_CREDENTIALS_PATH,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
} from "../config.js";

const execFileAsync = promisify(execFile);
const HELPER_COLUMN_INDEX = 14;
const HELPER_COLUMN_LETTER = "O";
const CONDITIONAL_TARGET_START_COLUMN_INDEX = 11;
const CONDITIONAL_TARGET_END_COLUMN_INDEX = 12;

type Color = { red: number; green: number; blue: number };

async function runGog(args: string[]): Promise<any> {
  const accountArgs = GOG_ACCOUNT ? ["--account", GOG_ACCOUNT] : [];
  const { stdout } = await execFileAsync("gog", [...args, ...accountArgs, "--json", "--no-input"], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = await buildGoogleAuth();
  return google.sheets({ version: "v4", auth });
}

async function buildGoogleAuth() {
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return oauth2;
  }

  const credentialsPath = GOG_CREDENTIALS_PATH ?? join(homedir(), ".config", "gogcli", "credentials.json");
  const credentials = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(credentialsPath, "utf8")));
  const { client_id, client_secret } = credentials as { client_id: string; client_secret: string };

  const tempTokenPath = await import("node:fs/promises").then(async (fs) => {
    const path = `/tmp/gog-token-${process.pid}-${Date.now()}.json`;
    if (!GOG_ACCOUNT) {
      throw new Error("Missing Google auth env. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN or GOG_ACCOUNT.");
    }
    await execFileAsync("gog", ["auth", "tokens", "export", GOG_ACCOUNT, "--out", path, "--overwrite", "--no-input"], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return path;
  });

  try {
    const token = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(tempTokenPath, "utf8")));
    const oauth2 = new google.auth.OAuth2(client_id, client_secret);
    oauth2.setCredentials({ refresh_token: token.refresh_token });
    return oauth2;
  } finally {
    await import("node:fs/promises").then((fs) => fs.rm(tempTokenPath, { force: true }));
  }
}

function rgb(red: number, green: number, blue: number): Color {
  return { red: red / 255, green: green / 255, blue: blue / 255 };
}

function backgroundFormat(color: Color) {
  return {
    backgroundColor: color,
  };
}

const NO_NOTE_RULE = {
  formula: `=$${HELPER_COLUMN_LETTER}2=""`,
  color: rgb(234, 234, 234),
};

const AGE_RULES = [
  { formula: `=AND(ISNUMBER($${HELPER_COLUMN_LETTER}2),$${HELPER_COLUMN_LETTER}2>=NOW()-2)`, color: rgb(217, 234, 211) },
  { formula: `=AND(ISNUMBER($${HELPER_COLUMN_LETTER}2),$${HELPER_COLUMN_LETTER}2<NOW()-2,$${HELPER_COLUMN_LETTER}2>=NOW()-7)`, color: rgb(255, 242, 204) },
  { formula: `=AND(ISNUMBER($${HELPER_COLUMN_LETTER}2),$${HELPER_COLUMN_LETTER}2<NOW()-7,$${HELPER_COLUMN_LETTER}2>=NOW()-14)`, color: rgb(252, 229, 205) },
  { formula: `=AND(ISNUMBER($${HELPER_COLUMN_LETTER}2),$${HELPER_COLUMN_LETTER}2<NOW()-14)`, color: rgb(244, 204, 204) },
] as const;

export async function ensureSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const data = await runGog(["sheets", "create", title]);
  const id = data.spreadsheetId ?? data.id ?? data.sheetId ?? "";
  const url = data.spreadsheetUrl ?? data.url ?? `https://docs.google.com/spreadsheets/d/${id}`;
  return { spreadsheetId: id, spreadsheetUrl: url };
}

export async function ensureTab(spreadsheetId: string, tabName: string): Promise<void> {
  const meta = await runGog(["sheets", "metadata", spreadsheetId]);
  const titles = (meta.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
  if (!titles.includes(tabName)) {
    await runGog(["sheets", "add-tab", spreadsheetId, tabName]);
  }
}

export async function writeRows(spreadsheetId: string, tabName: string, values: string[][]): Promise<void> {
  await ensureTab(spreadsheetId, tabName);
  await runGog(["sheets", "clear", spreadsheetId, `${tabName}!A:O`]);
  await runGog(["sheets", "update", spreadsheetId, `${tabName}!A1`, "--values-json", JSON.stringify(values), "--input", "USER_ENTERED"]);
  await applySheetStyle(spreadsheetId, tabName, Math.max(values.length, 2));
  await applyConditionalAging(spreadsheetId, tabName, Math.max(values.length, 2));
}

export async function applySheetStyle(spreadsheetId: string, tabName: string, rowCount: number): Promise<void> {
  const headerFormat = {
    backgroundColor: { red: 26 / 255, green: 115 / 255, blue: 232 / 255 },
    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    wrapStrategy: "WRAP",
  };

  const bodyFormat = {
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  };

  const compactTextFormat = {
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    wrapStrategy: "WRAP",
  };

  const blackLinkFormat = {
    textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  };

  const dateFormat = {
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  };

  const noteFormat = {
    horizontalAlignment: "LEFT",
    wrapStrategy: "WRAP",
    verticalAlignment: "MIDDLE",
  };

  const lightBlueBorders = {
    top: { style: "SOLID", color: { red: 189 / 255, green: 215 / 255, blue: 238 / 255 } },
    bottom: { style: "SOLID", color: { red: 189 / 255, green: 215 / 255, blue: 238 / 255 } },
    left: { style: "SOLID", color: { red: 189 / 255, green: 215 / 255, blue: 238 / 255 } },
    right: { style: "SOLID", color: { red: 189 / 255, green: 215 / 255, blue: 238 / 255 } },
  };

  await runGog(["sheets", "freeze", spreadsheetId, "--sheet", tabName, "--rows", "1", "--cols", "3"]);
  await runGog(["sheets", "format", spreadsheetId, `${tabName}!A1:N${rowCount}`, "--format-json", JSON.stringify({ borders: lightBlueBorders }), "--format-fields", "borders"]);
  await runGog(["sheets", "format", spreadsheetId, `${tabName}!A1:N1`, "--format-json", JSON.stringify(headerFormat), "--format-fields", "backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy"]);

  if (rowCount > 1) {
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!A2:N${rowCount}`, "--format-json", JSON.stringify(bodyFormat), "--format-fields", "horizontalAlignment,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!A2:A${rowCount}`, "--format-json", JSON.stringify(blackLinkFormat), "--format-fields", "textFormat.foregroundColor,horizontalAlignment,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!C2:C${rowCount}`, "--format-json", JSON.stringify(blackLinkFormat), "--format-fields", "textFormat.foregroundColor,horizontalAlignment,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!B2:C${rowCount}`, "--format-json", JSON.stringify(compactTextFormat), "--format-fields", "horizontalAlignment,wrapStrategy,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!D2:L${rowCount}`, "--format-json", JSON.stringify(dateFormat), "--format-fields", "horizontalAlignment,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!M2:M${rowCount}`, "--format-json", JSON.stringify(compactTextFormat), "--format-fields", "horizontalAlignment,wrapStrategy,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!N2:N${rowCount}`, "--format-json", JSON.stringify(noteFormat), "--format-fields", "horizontalAlignment,wrapStrategy,verticalAlignment"]);
    await runGog(["sheets", "format", spreadsheetId, `${tabName}!O2:O${rowCount}`, "--format-json", JSON.stringify({ numberFormat: { type: "DATE_TIME", pattern: "yyyy-mm-dd hh:mm:ss" } }), "--format-fields", "numberFormat"]);
    await ensureNoNoteComments(spreadsheetId, tabName, rowCount);
    await runGog(["sheets", "resize-rows", spreadsheetId, `${tabName}!2:${rowCount}`, "--auto"]);
  }

  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!A:A`, "--width", "105"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!B:B`, "--width", "230"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!C:C`, "--width", "220"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!D:E`, "--width", "170"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!F:G`, "--width", "190"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!H:I`, "--width", "115"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!J:L`, "--width", "170"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!M:M`, "--width", "200"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!N:N`, "--width", "620"]);
  await runGog(["sheets", "resize-columns", spreadsheetId, `${tabName}!O:O`, "--width", "140"]);
  await hideHelperColumn(spreadsheetId, tabName);
}

async function hideHelperColumn(spreadsheetId: string, tabName: string): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = await getSheetId(sheets, spreadsheetId, tabName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: HELPER_COLUMN_INDEX,
              endIndex: HELPER_COLUMN_INDEX + 1,
            },
            properties: { hiddenByUser: true },
            fields: "hiddenByUser",
          },
        },
      ],
    },
  });
}

async function applyConditionalAging(spreadsheetId: string, tabName: string, rowCount: number): Promise<void> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties,conditionalFormats)" });
  const match = (meta.data.sheets ?? []).find((sheet) => sheet.properties?.title === tabName);
  const sheetId = match?.properties?.sheetId;
  if (typeof sheetId !== "number") throw new Error(`Tab not found: ${tabName}`);
  const managedFormulas = new Set([NO_NOTE_RULE.formula, ...AGE_RULES.map((rule) => rule.formula)]);
  const existingRules = match?.conditionalFormats ?? [];
  const managedRuleIndexes = existingRules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => {
      const formula = rule.booleanRule?.condition?.values?.[0]?.userEnteredValue;
      const range = rule.ranges?.[0];
      return (
        formula != null &&
        managedFormulas.has(formula) &&
        range?.startColumnIndex === CONDITIONAL_TARGET_START_COLUMN_INDEX &&
        range?.endColumnIndex === CONDITIONAL_TARGET_END_COLUMN_INDEX
      );
    })
    .map(({ index }) => index)
    .sort((a, b) => b - a);

  const requests: sheets_v4.Schema$Request[] = managedRuleIndexes.map((index) => ({
    deleteConditionalFormatRule: {
      sheetId,
      index,
    },
  }));
  const insertionIndex = existingRules.length - managedRuleIndexes.length;

  [NO_NOTE_RULE, ...AGE_RULES].forEach((rule, idx) => {
    requests.push({
      addConditionalFormatRule: {
        index: insertionIndex + idx,
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount,
              startColumnIndex: CONDITIONAL_TARGET_START_COLUMN_INDEX,
              endColumnIndex: CONDITIONAL_TARGET_END_COLUMN_INDEX,
            },
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [{ userEnteredValue: rule.formula }],
            },
            format: backgroundFormat(rule.color),
          },
        },
      },
    });
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function ensureNoNoteComments(spreadsheetId: string, tabName: string, rowCount: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = await getSheetId(sheets, spreadsheetId, tabName);
  const range = `${tabName}!N2:N${rowCount}`;
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: [range],
  });
  const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const requests: sheets_v4.Schema$Request[] = rowData.map((row, index) => {
    const formattedValue = row.values?.[0]?.formattedValue ?? "";
    const hasNoNote = formattedValue.trim() === "No note found";

    return {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: index + 1,
          endRowIndex: index + 2,
          startColumnIndex: 13,
          endColumnIndex: 14,
        },
        rows: [
          {
            values: [
              {
                note: hasNoNote ? "No note was found for this draft quote during sync." : null,
              },
            ],
          },
        ],
        fields: "note",
      },
    };
  });

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }
}

async function getSheetId(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const match = (meta.data.sheets ?? []).find((sheet) => sheet.properties?.title === tabName);
  const id = match?.properties?.sheetId;
  if (typeof id !== "number") throw new Error(`Tab not found: ${tabName}`);
  return id;
}

export async function readRows(spreadsheetId: string, tabName: string, range = "A1:N20"): Promise<string[][]> {
  const data = await runGog(["sheets", "get", spreadsheetId, `${tabName}!${range}`]);
  const values = data.values ?? data;
  return Array.isArray(values) ? values.map((row: any[]) => row.map((cell) => String(cell))) : [];
}
