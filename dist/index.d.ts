export declare function runSheetInit(title?: string): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
}>;
export declare function runSync(options?: {
    spreadsheetId?: string;
    tabName?: string;
    limit?: number;
    pageSize?: number;
}): Promise<{
    spreadsheetId: string;
    tabNames: string[];
    rowCount: number;
    pageSize: number;
    elapsed: string;
    status: "ok";
}>;
export declare function runSample(limit?: number): Promise<import("./types.js").SheetRow[]>;
export declare function runCommand(command: string): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
} | import("./types.js").SheetRow[] | {
    spreadsheetId: string;
    tabNames: string[];
    rowCount: number;
    pageSize: number;
    elapsed: string;
    status: "ok";
}>;
