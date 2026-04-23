import { NO_NOTE_COMMENT } from "./constants.js";

export type SheetLayout = {
  key: string;
  tabNames: string[];
  headers: string[];
  clearRange: string;
  readPreviewRange: string;
  frozenRowCount: number;
  frozenColumnCount: number;
  helperColumnIndex: number;
  helperColumnLetter: string;
  noteColumnIndex: number;
  noteColumnLetter: string;
  conditionalTargetColumnIndex: number;
  hiddenColumnIndexes: number[];
  defaultNoNoteComment: string;
  columnWidths: Array<{ startIndex: number; endIndex: number; pixelSize: number }>;
};

export const draftSheetLayout: SheetLayout = {
  key: "draft",
  tabNames: ["DRAFT"],
  headers: [
    "Quote Number",
    "Quote Title",
    "Client Name",
    "Draft Created",
    "Last Updated",
    "Native Salesperson",
    "KC Sales Rep",
    "Lead Source",
    "Quote Status",
    "Last Note Created At",
    "Last Note Edited At",
    "Last Sales Touch At",
    "Last Sales Touch By",
    "Last Note Text",
    "Last Sales Touch Helper",
  ],
  clearRange: "A:O",
  readPreviewRange: "A1:N20",
  frozenRowCount: 1,
  frozenColumnCount: 3,
  helperColumnIndex: 14,
  helperColumnLetter: "O",
  noteColumnIndex: 13,
  noteColumnLetter: "N",
  conditionalTargetColumnIndex: 11,
  hiddenColumnIndexes: [14],
  defaultNoNoteComment: NO_NOTE_COMMENT,
  columnWidths: [
    { startIndex: 0, endIndex: 1, pixelSize: 105 },
    { startIndex: 1, endIndex: 2, pixelSize: 230 },
    { startIndex: 2, endIndex: 3, pixelSize: 220 },
    { startIndex: 3, endIndex: 5, pixelSize: 170 },
    { startIndex: 5, endIndex: 7, pixelSize: 190 },
    { startIndex: 7, endIndex: 9, pixelSize: 115 },
    { startIndex: 9, endIndex: 12, pixelSize: 170 },
    { startIndex: 12, endIndex: 13, pixelSize: 200 },
    { startIndex: 13, endIndex: 14, pixelSize: 620 },
    { startIndex: 14, endIndex: 15, pixelSize: 140 },
  ],
};

export const sheetLayouts: SheetLayout[] = [draftSheetLayout];

export function resolveSheetLayout(tabName: string): SheetLayout {
  const normalizedTabName = tabName.trim().toUpperCase();
  return sheetLayouts.find((layout) => layout.tabNames.includes(normalizedTabName)) ?? draftSheetLayout;
}
