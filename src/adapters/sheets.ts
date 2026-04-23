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

async function getSpreadsheetSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  fields = "sheets.properties",
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields });
  return (meta.data.sheets ?? []).find((sheet) => sheet.properties?.title === tabName) ?? null;
}

export async function ensureSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
    },
    fields: "spreadsheetId,spreadsheetUrl",
  });
  const id = response.data.spreadsheetId ?? "";
  const url = response.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`;
  return { spreadsheetId: id, spreadsheetUrl: url };
}

export async function ensureTab(spreadsheetId: string, tabName: string): Promise<void> {
  const sheets = await getSheetsClient();
  const existing = await getSpreadsheetSheet(sheets, spreadsheetId, tabName);
  if (existing) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
            },
          },
        },
      ],
    },
  });
}

export async function writeRows(spreadsheetId: string, tabName: string, values: string[][]): Promise<void> {
  const sheets = await getSheetsClient();
  await ensureTab(spreadsheetId, tabName);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!A:O` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  await applySheetStyle(spreadsheetId, tabName, Math.max(values.length, 2));
  await applyConditionalAging(spreadsheetId, tabName, Math.max(values.length, 2));
}

export async function applySheetStyle(spreadsheetId: string, tabName: string, rowCount: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = await getSheetId(sheets, spreadsheetId, tabName);

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

  const requests: sheets_v4.Schema$Request[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            frozenColumnCount: 3,
          },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    repeatCellRequest(sheetId, 0, rowCount, 0, 14, { userEnteredFormat: { borders: lightBlueBorders } }, "userEnteredFormat.borders"),
    repeatCellRequest(
      sheetId,
      0,
      1,
      0,
      14,
      { userEnteredFormat: headerFormat },
      "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
    ),
  ];

  if (rowCount > 1) {
    requests.push(
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        0,
        14,
        { userEnteredFormat: bodyFormat },
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        0,
        1,
        { userEnteredFormat: blackLinkFormat },
        "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        2,
        3,
        { userEnteredFormat: blackLinkFormat },
        "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        1,
        3,
        { userEnteredFormat: compactTextFormat },
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        3,
        12,
        { userEnteredFormat: dateFormat },
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        12,
        13,
        { userEnteredFormat: compactTextFormat },
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        13,
        14,
        { userEnteredFormat: noteFormat },
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment",
      ),
      repeatCellRequest(
        sheetId,
        1,
        rowCount,
        14,
        15,
        { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "yyyy-mm-dd hh:mm:ss" } } },
        "userEnteredFormat.numberFormat",
      ),
      autoResizeRowsRequest(sheetId, 1, rowCount),
    );
  }

  requests.push(
    setColumnWidthRequest(sheetId, 0, 1, 105),
    setColumnWidthRequest(sheetId, 1, 2, 230),
    setColumnWidthRequest(sheetId, 2, 3, 220),
    setColumnWidthRequest(sheetId, 3, 5, 170),
    setColumnWidthRequest(sheetId, 5, 7, 190),
    setColumnWidthRequest(sheetId, 7, 9, 115),
    setColumnWidthRequest(sheetId, 9, 12, 170),
    setColumnWidthRequest(sheetId, 12, 13, 200),
    setColumnWidthRequest(sheetId, 13, 14, 620),
    setColumnWidthRequest(sheetId, 14, 15, 140),
    hideColumnRequest(sheetId, HELPER_COLUMN_INDEX, HELPER_COLUMN_INDEX + 1),
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  if (rowCount > 1) {
    await ensureNoNoteComments(spreadsheetId, tabName, rowCount);
  }
}

function repeatCellRequest(
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  startColumnIndex: number,
  endColumnIndex: number,
  cell: sheets_v4.Schema$CellData,
  fields: string,
): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex,
        endRowIndex,
        startColumnIndex,
        endColumnIndex,
      },
      cell,
      fields,
    },
  };
}

function setColumnWidthRequest(
  sheetId: number,
  startIndex: number,
  endIndex: number,
  pixelSize: number,
): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: "COLUMNS",
        startIndex,
        endIndex,
      },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  };
}

function autoResizeRowsRequest(sheetId: number, startIndex: number, endIndex: number): sheets_v4.Schema$Request {
  return {
    autoResizeDimensions: {
      dimensions: {
        sheetId,
        dimension: "ROWS",
        startIndex,
        endIndex,
      },
    },
  };
}

function hideColumnRequest(sheetId: number, startIndex: number, endIndex: number): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: "COLUMNS",
        startIndex,
        endIndex,
      },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  };
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
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: [`${tabName}!N2:N${rowCount}`],
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
  const match = await getSpreadsheetSheet(sheets, spreadsheetId, tabName, "sheets.properties");
  const id = match?.properties?.sheetId;
  if (typeof id !== "number") throw new Error(`Tab not found: ${tabName}`);
  return id;
}

export async function readRows(spreadsheetId: string, tabName: string, range = "A1:N20"): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${range}`,
  });
  return (response.data.values ?? []).map((row) => row.map((cell) => String(cell)));
}
