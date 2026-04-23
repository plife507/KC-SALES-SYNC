export declare function requireEnv(name: string): string;
export declare const runtimeConfig: {
    readonly sheetTitle: "kc-sales-sync";
    readonly defaultTabName: "DRAFT";
    readonly defaultQuoteLimit: 100;
    readonly defaultQuotePageSize: 10;
    readonly spreadsheetId: string | undefined;
    readonly jobber: {
        readonly accessToken: string | undefined;
        readonly clientId: string | undefined;
        readonly clientSecret: string | undefined;
        readonly refreshToken: string | undefined;
        readonly apiUrl: string;
        readonly apiVersion: string;
        readonly requestDelayMs: number;
        readonly notesPageSize: number;
    };
    readonly google: {
        readonly gogAccount: string | undefined;
        readonly gogCredentialsPath: string | undefined;
        readonly clientId: string | undefined;
        readonly clientSecret: string | undefined;
        readonly refreshToken: string | undefined;
    };
    readonly runtime: {
        readonly isCloudRun: boolean;
        readonly allowDebugCommands: boolean;
        readonly allowLocalSheetsFallback: boolean;
    };
    readonly sync: {
        readonly tabName: string;
        readonly tabNames: string[];
        readonly quoteLimit: number;
        readonly quotePageSize: number;
    };
};
