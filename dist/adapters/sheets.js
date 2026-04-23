import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { google } from "googleapis";
import { NO_NOTE_TEXT, resolveSheetLayout, runtimeConfig } from "../config.js";
const execFileAsync = promisify(execFile);
async function getSheetsClient() {
    const auth = await buildGoogleAuth();
    return google.sheets({ version: "v4", auth });
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
    const credentials = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(credentialsPath, "utf8")));
    const { client_id, client_secret } = credentials;
    const tempTokenPath = await import("node:fs/promises").then(async (fs) => {
        const path = `/tmp/gog-token-${process.pid}-${Date.now()}.json`;
        if (!gogAccount) {
            throw new Error("Missing Google auth env. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN or GOG_ACCOUNT.");
        }
        await execFileAsync("gog", ["auth", "tokens", "export", gogAccount, "--out", path, "--overwrite", "--no-input"], {
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
    }
    finally {
        await import("node:fs/promises").then((fs) => fs.rm(tempTokenPath, { force: true }));
    }
}
function rgb(red, green, blue) {
    return { red: red / 255, green: green / 255, blue: blue / 255 };
}
function backgroundFormat(color) {
    return {
        backgroundColor: color,
    };
}
function buildConditionalRules(helperColumnLetter) {
    const noNoteRule = {
        formula: `=$${helperColumnLetter}2=""`,
        color: rgb(234, 234, 234),
    };
    const ageRules = [
        { formula: `=AND(ISNUMBER($${helperColumnLetter}2),$${helperColumnLetter}2>=NOW()-2)`, color: rgb(217, 234, 211) },
        { formula: `=AND(ISNUMBER($${helperColumnLetter}2),$${helperColumnLetter}2<NOW()-2,$${helperColumnLetter}2>=NOW()-7)`, color: rgb(255, 242, 204) },
        { formula: `=AND(ISNUMBER($${helperColumnLetter}2),$${helperColumnLetter}2<NOW()-7,$${helperColumnLetter}2>=NOW()-14)`, color: rgb(252, 229, 205) },
        { formula: `=AND(ISNUMBER($${helperColumnLetter}2),$${helperColumnLetter}2<NOW()-14)`, color: rgb(244, 204, 204) },
    ];
    return { noNoteRule, ageRules };
}
async function getSpreadsheetSheet(sheets, spreadsheetId, tabName, fields = "sheets.properties") {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields });
    return (meta.data.sheets ?? []).find((sheet) => sheet.properties?.title === tabName) ?? null;
}
export async function ensureSpreadsheet(title) {
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
export async function ensureTab(spreadsheetId, tabName) {
    const sheets = await getSheetsClient();
    const existing = await getSpreadsheetSheet(sheets, spreadsheetId, tabName);
    if (existing)
        return;
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
const SYNC_LOG_TAB = "Log";
const SYNC_LOG_HEADERS = ["Timestamp", "Command", "Tabs", "Status", "Quotes", "Elapsed", "Error"];
const MAX_SYNC_LOG_ROWS = 500;
async function ensureSyncLogTab(sheets, spreadsheetId) {
    const existing = await getSpreadsheetSheet(sheets, spreadsheetId, SYNC_LOG_TAB, "sheets.properties");
    if (existing)
        return;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    addSheet: {
                        properties: {
                            title: SYNC_LOG_TAB,
                            index: 0,
                        },
                    },
                },
            ],
        },
    });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${SYNC_LOG_TAB}'!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
            values: [SYNC_LOG_HEADERS],
        },
    });
}
export async function logSyncResult(spreadsheetId, entry) {
    const sheets = await getSheetsClient();
    await ensureSyncLogTab(sheets, spreadsheetId);
    const existingRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SYNC_LOG_TAB}'!A2:A${MAX_SYNC_LOG_ROWS + 1}`,
    });
    const existingRowCount = (existingRows.data.values ?? []).filter((row) => (row?.[0] ?? "").toString().trim().length > 0).length;
    if (existingRowCount >= MAX_SYNC_LOG_ROWS) {
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${SYNC_LOG_TAB}'!A2:G`,
        });
    }
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${SYNC_LOG_TAB}'!A:G`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: [[
                    entry.timestamp,
                    entry.command,
                    entry.tabNames.join(", "),
                    entry.status,
                    entry.quoteCount,
                    entry.elapsed,
                    entry.error,
                ]],
        },
    });
}
export async function writeRows(spreadsheetId, tabName, values) {
    const sheets = await getSheetsClient();
    const layout = resolveSheetLayout(tabName);
    await ensureTab(spreadsheetId, tabName);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!${layout.clearRange}` });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
    });
    await applySheetStyle(spreadsheetId, tabName, Math.max(values.length, 2));
    await applyConditionalAging(spreadsheetId, tabName, Math.max(values.length, 2));
}
export async function applySheetStyle(spreadsheetId, tabName, rowCount) {
    const sheets = await getSheetsClient();
    const sheetId = await getSheetId(sheets, spreadsheetId, tabName);
    const layout = resolveSheetLayout(tabName);
    const dataColumnCount = layout.headers.length - 1;
    const totalColumnCount = layout.headers.length;
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
    const requests = [
        {
            updateSheetProperties: {
                properties: {
                    sheetId,
                    gridProperties: {
                        frozenRowCount: layout.frozenRowCount,
                        frozenColumnCount: layout.frozenColumnCount,
                    },
                },
                fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
            },
        },
        repeatCellRequest(sheetId, 0, rowCount, 0, dataColumnCount, { userEnteredFormat: { borders: lightBlueBorders } }, "userEnteredFormat.borders"),
        repeatCellRequest(sheetId, 0, 1, 0, dataColumnCount, { userEnteredFormat: headerFormat }, "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy"),
    ];
    if (rowCount > 1) {
        requests.push(repeatCellRequest(sheetId, 1, rowCount, 0, dataColumnCount, { userEnteredFormat: bodyFormat }, "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, 0, 1, { userEnteredFormat: blackLinkFormat }, "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, 2, 3, { userEnteredFormat: blackLinkFormat }, "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, 1, 3, { userEnteredFormat: compactTextFormat }, "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, 3, 12, { userEnteredFormat: dateFormat }, "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, 12, 13, { userEnteredFormat: compactTextFormat }, "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, layout.noteColumnIndex, layout.noteColumnIndex + 1, { userEnteredFormat: noteFormat }, "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment"), repeatCellRequest(sheetId, 1, rowCount, layout.helperColumnIndex, layout.helperColumnIndex + 1, { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "yyyy-mm-dd hh:mm:ss" } } }, "userEnteredFormat.numberFormat"), autoResizeRowsRequest(sheetId, 1, rowCount));
    }
    layout.columnWidths.forEach(({ startIndex, endIndex, pixelSize }) => {
        requests.push(setColumnWidthRequest(sheetId, startIndex, endIndex, pixelSize));
    });
    layout.hiddenColumnIndexes.forEach((index) => {
        requests.push(hideColumnRequest(sheetId, index, index + 1));
    });
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
    });
    if (rowCount > 1) {
        await ensureNoNoteComments(spreadsheetId, tabName, rowCount);
    }
}
function repeatCellRequest(sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex, cell, fields) {
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
function setColumnWidthRequest(sheetId, startIndex, endIndex, pixelSize) {
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
function autoResizeRowsRequest(sheetId, startIndex, endIndex) {
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
function hideColumnRequest(sheetId, startIndex, endIndex) {
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
async function applyConditionalAging(spreadsheetId, tabName, rowCount) {
    const sheets = await getSheetsClient();
    const layout = resolveSheetLayout(tabName);
    const { noNoteRule, ageRules } = buildConditionalRules(layout.helperColumnLetter);
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties,conditionalFormats)" });
    const match = (meta.data.sheets ?? []).find((sheet) => sheet.properties?.title === tabName);
    const sheetId = match?.properties?.sheetId;
    if (typeof sheetId !== "number")
        throw new Error(`Tab not found: ${tabName}`);
    const managedFormulas = new Set([noNoteRule.formula, ...ageRules.map((rule) => rule.formula)]);
    const existingRules = match?.conditionalFormats ?? [];
    const managedRuleIndexes = existingRules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => {
        const formula = rule.booleanRule?.condition?.values?.[0]?.userEnteredValue;
        const range = rule.ranges?.[0];
        return (formula != null &&
            managedFormulas.has(formula) &&
            range?.startColumnIndex === layout.conditionalTargetColumnIndex &&
            range?.endColumnIndex === layout.conditionalTargetColumnIndex + 1);
    })
        .map(({ index }) => index)
        .sort((a, b) => b - a);
    const requests = managedRuleIndexes.map((index) => ({
        deleteConditionalFormatRule: {
            sheetId,
            index,
        },
    }));
    const insertionIndex = existingRules.length - managedRuleIndexes.length;
    [noNoteRule, ...ageRules].forEach((rule, idx) => {
        requests.push({
            addConditionalFormatRule: {
                index: insertionIndex + idx,
                rule: {
                    ranges: [
                        {
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: rowCount,
                            startColumnIndex: layout.conditionalTargetColumnIndex,
                            endColumnIndex: layout.conditionalTargetColumnIndex + 1,
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
async function ensureNoNoteComments(spreadsheetId, tabName, rowCount) {
    const sheets = await getSheetsClient();
    const sheetId = await getSheetId(sheets, spreadsheetId, tabName);
    const layout = resolveSheetLayout(tabName);
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: [`${tabName}!${layout.noteColumnLetter}2:${layout.noteColumnLetter}${rowCount}`],
    });
    const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
    const requests = [];
    rowData.forEach((row, index) => {
        const cell = row.values?.[0];
        const formattedValue = cell?.formattedValue ?? "";
        const existingNote = cell?.note ?? null;
        const hasNoNote = formattedValue.trim() === NO_NOTE_TEXT;
        const desiredNote = hasNoNote ? layout.defaultNoNoteComment : null;
        if (existingNote === desiredNote) {
            return;
        }
        requests.push({
            updateCells: {
                range: {
                    sheetId,
                    startRowIndex: index + 1,
                    endRowIndex: index + 2,
                    startColumnIndex: layout.noteColumnIndex,
                    endColumnIndex: layout.noteColumnIndex + 1,
                },
                rows: [
                    {
                        values: [
                            {
                                note: desiredNote,
                            },
                        ],
                    },
                ],
                fields: "note",
            },
        });
    });
    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests },
        });
    }
}
async function getSheetId(sheets, spreadsheetId, tabName) {
    const match = await getSpreadsheetSheet(sheets, spreadsheetId, tabName, "sheets.properties");
    const id = match?.properties?.sheetId;
    if (typeof id !== "number")
        throw new Error(`Tab not found: ${tabName}`);
    return id;
}
export async function readRows(spreadsheetId, tabName, range) {
    const sheets = await getSheetsClient();
    const layout = resolveSheetLayout(tabName);
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!${range ?? layout.readPreviewRange}`,
    });
    return (response.data.values ?? []).map((row) => row.map((cell) => String(cell)));
}
