export type QuoteCustomField = {
  label: string;
  value: string;
  valueType: string;
};

export type QuoteNoteActor = {
  type: string;
  id?: string;
  name: string;
};

export type QuoteNote = {
  id: string;
  message: string;
  createdAt: string;
  lastEditedAt: string | null;
  createdBy: QuoteNoteActor | null;
  lastEditedBy: QuoteNoteActor | null;
};

export type DraftQuote = {
  id: string;
  quoteNumber: string;
  quoteStatus: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  quoteWebUri: string;
  clientName: string;
  clientWebUri: string;
  nativeSalesperson: string;
  kcSalesRep: string;
  leadSource: string;
  notes: QuoteNote[];
};

export type SheetRow = {
  quoteNumber: string;
  quoteTitle: string;
  clientName: string;
  draftCreated: string;
  lastUpdated: string;
  nativeSalesperson: string;
  kcSalesRep: string;
  leadSource: string;
  quoteStatus: string;
  lastNoteCreatedAt: string;
  lastNoteEditedAt: string;
  lastSalesTouchAt: string;
  lastSalesTouchBy: string;
  lastNoteText: string;
  lastSalesTouchAtRaw: string;
};
