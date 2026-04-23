const NO_NOTE_TEXT = "No note found";
const PACIFIC_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
});
function byNewestActivity(a, b) {
    const aTs = Date.parse(a.lastEditedAt ?? a.createdAt);
    const bTs = Date.parse(b.lastEditedAt ?? b.createdAt);
    return bTs - aTs;
}
function normalizeNoteText(message) {
    return message.replace(/\s+/g, " ").trim();
}
function parseDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function formatPacific(value) {
    const date = parseDate(value);
    if (!date)
        return value ?? "";
    const parts = Object.fromEntries(PACIFIC_FORMATTER.formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]));
    return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`;
}
function toSheetsSerial(value) {
    const date = parseDate(value);
    if (!date)
        return "";
    const serial = date.getTime() / 86400000 + 25569;
    return serial.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}
function escapeFormulaText(value) {
    return value.replace(/"/g, '""');
}
function hyperlink(url, label) {
    const resolvedLabel = label ?? "";
    const resolvedUrl = url ?? "";
    const safeLabel = escapeFormulaText(resolvedLabel);
    const safeUrl = resolvedUrl.replace(/"/g, "%22");
    return resolvedUrl ? `=HYPERLINK("${safeUrl}","${safeLabel}")` : resolvedLabel;
}
export function resolveLastTouch(notes) {
    if (notes.length === 0) {
        return {
            lastNoteCreatedAt: "",
            lastNoteEditedAt: "",
            lastSalesTouchAt: "",
            lastSalesTouchBy: "",
            lastNoteText: NO_NOTE_TEXT,
            lastSalesTouchAtRaw: "",
        };
    }
    const latestCreated = [...notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const latestEdited = [...notes]
        .filter((note) => !!note.lastEditedAt)
        .sort((a, b) => Date.parse(b.lastEditedAt ?? "") - Date.parse(a.lastEditedAt ?? ""))[0] ?? null;
    const latestTouch = [...notes].sort(byNewestActivity)[0];
    const latestTouchActor = latestTouch.lastEditedBy ?? latestTouch.createdBy;
    const latestTouchRaw = latestTouch.lastEditedAt ?? latestTouch.createdAt;
    return {
        lastNoteCreatedAt: formatPacific(latestCreated.createdAt),
        lastNoteEditedAt: formatPacific(latestEdited?.lastEditedAt ?? ""),
        lastSalesTouchAt: formatPacific(latestTouchRaw),
        lastSalesTouchBy: latestTouchActor?.name ?? "",
        lastNoteText: normalizeNoteText(latestTouch.message),
        lastSalesTouchAtRaw: toSheetsSerial(latestTouchRaw),
    };
}
export function quoteToSheetRow(quote) {
    const touch = resolveLastTouch(quote.notes);
    return {
        quoteNumber: hyperlink(quote.quoteWebUri, quote.quoteNumber),
        quoteTitle: quote.title,
        clientName: hyperlink(quote.clientWebUri, quote.clientName),
        draftCreated: formatPacific(quote.createdAt),
        lastUpdated: formatPacific(quote.updatedAt),
        nativeSalesperson: quote.nativeSalesperson,
        kcSalesRep: quote.kcSalesRep,
        leadSource: quote.leadSource,
        quoteStatus: quote.quoteStatus,
        ...touch,
    };
}
export function rowsToSheetValues(rows) {
    return [
        [
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
        ...rows.map((row) => [
            row.quoteNumber,
            row.quoteTitle,
            row.clientName,
            row.draftCreated,
            row.lastUpdated,
            row.nativeSalesperson,
            row.kcSalesRep,
            row.leadSource,
            row.quoteStatus,
            row.lastNoteCreatedAt,
            row.lastNoteEditedAt,
            row.lastSalesTouchAt,
            row.lastSalesTouchBy,
            row.lastNoteText,
            row.lastSalesTouchAtRaw,
        ]),
    ];
}
