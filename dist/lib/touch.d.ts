import type { DraftQuote, QuoteNote, SheetRow } from "../types.js";
export declare function resolveLastTouch(notes: QuoteNote[]): {
    lastNoteCreatedAt: string;
    lastNoteEditedAt: string;
    lastSalesTouchAt: string;
    lastSalesTouchBy: string;
    lastNoteText: string;
    lastSalesTouchAtRaw: string;
};
export declare function quoteToSheetRow(quote: DraftQuote): SheetRow;
export declare function rowsToSheetValues(rows: SheetRow[]): string[][];
