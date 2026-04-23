export declare function ensureSpreadsheet(title: string): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
}>;
export declare function ensureTab(spreadsheetId: string, tabName: string): Promise<void>;
export interface SyncLogEntry {
    timestamp: string;
    command: string;
    tabNames: string[];
    status: string;
    quoteCount: number;
    elapsed: string;
    error: string;
}
export declare function logSyncResult(spreadsheetId: string, entry: SyncLogEntry): Promise<void>;
export declare function writeRows(spreadsheetId: string, tabName: string, values: string[][]): Promise<void>;
export declare function applySheetStyle(spreadsheetId: string, tabName: string, rowCount: number): Promise<void>;
export declare function readRows(spreadsheetId: string, tabName: string, range?: string): Promise<string[][]>;
