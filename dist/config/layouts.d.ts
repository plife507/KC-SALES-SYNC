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
    columnWidths: Array<{
        startIndex: number;
        endIndex: number;
        pixelSize: number;
    }>;
};
export declare const draftSheetLayout: SheetLayout;
export declare const sheetLayouts: SheetLayout[];
export declare function resolveSheetLayout(tabName: string): SheetLayout;
