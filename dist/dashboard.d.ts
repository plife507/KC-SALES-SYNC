type DashboardBucketKey = "overdue" | "stale" | "active";
type FilterKey = "all" | "overdue" | "stale" | "active" | "unassigned" | "no-note";
export type DashboardRow = {
    quoteNumber: string;
    quoteUrl: string;
    quoteTitle: string;
    clientName: string;
    clientUrl: string;
    repName: string;
    nativeSalesperson: string;
    leadSource: string;
    status: string;
    quoteStatus: string;
    daysSinceTouch: number | null;
    lastTouchAt: string;
    lastTouchBy: string;
    lastNoteSummary: string;
    rowTone: DashboardBucketKey;
    missingOwner: boolean;
    hasNoNote: boolean;
};
export type DashboardRepCard = {
    repName: string;
    totalDrafts: number;
    overdue: number;
    stale: number;
    active: number;
    scoreLabel: string;
    note: string;
};
export type DashboardMetric = {
    totalDrafts: number;
    overdue: number;
    stale: number;
    active: number;
    unassigned: number;
    noNote: number;
};
export type DashboardSummary = {
    oldestTouchDays: number | null;
    rowsWithNoTouch: number;
    uniqueLeadSources: number;
};
export type DashboardPayload = {
    generatedAt: string;
    spreadsheetId: string;
    tabName: string;
    metrics: DashboardMetric;
    summary: DashboardSummary;
    repNames: string[];
    leadSources: string[];
    reps: DashboardRepCard[];
    rows: DashboardRow[];
    filters: Array<{
        key: FilterKey;
        label: string;
    }>;
};
export declare function buildDashboardData(options?: {
    spreadsheetId?: string;
    tabName?: string;
}): Promise<DashboardPayload>;
export declare function writeDashboardData(options?: {
    spreadsheetId?: string;
    tabName?: string;
    outputPath?: string;
}): Promise<{
    outputPath: string;
    jsOutputPath: string;
    rowCount: number;
    repCount: number;
    generatedAt: string;
    tabName: string;
    spreadsheetId: string;
}>;
export {};
