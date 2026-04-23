import test from "node:test";
import assert from "node:assert/strict";

import { quoteToSheetRow, resolveLastTouch, rowsToSheetValues } from "../src/lib/touch.js";
import type { DraftQuote, QuoteNote } from "../src/types.js";

const notes: QuoteNote[] = [
  {
    id: "n1",
    message: "first note",
    createdAt: "2026-04-20T10:00:00Z",
    lastEditedAt: null,
    createdBy: { type: "User", name: "Alex" },
    lastEditedBy: null,
  },
  {
    id: "n2",
    message: "second note updated later",
    createdAt: "2026-04-21T10:00:00Z",
    lastEditedAt: "2026-04-22T12:00:00Z",
    createdBy: { type: "User", name: "Sean" },
    lastEditedBy: { type: "User", name: "Sean" },
  },
];

test("resolveLastTouch prefers lastEditedAt when newer", () => {
  const result = resolveLastTouch(notes);
  assert.equal(result.lastNoteCreatedAt, "Apr 21, 2026 3:00 AM PDT");
  assert.equal(result.lastNoteEditedAt, "Apr 22, 2026 5:00 AM PDT");
  assert.equal(result.lastSalesTouchAt, "Apr 22, 2026 5:00 AM PDT");
  assert.equal(result.lastSalesTouchBy, "Sean");
  assert.equal(result.lastNoteText, "second note updated later");
});

test("quoteToSheetRow maps quote and touch fields", () => {
  const quote: DraftQuote = {
    id: "q1",
    quoteNumber: "111656",
    quoteStatus: "draft",
    title: "Boat trailer sandblast",
    createdAt: "2026-04-22T22:20:57Z",
    updatedAt: "2026-04-22T23:36:49Z",
    quoteWebUri: "https://secure.getjobber.com/app/quotes/111656",
    clientName: "Marcelo Leao",
    clientWebUri: "https://secure.getjobber.com/app/clients/123",
    nativeSalesperson: "HQ - Sales - Alex Acevez",
    kcSalesRep: "Preliminary Estimate",
    leadSource: "(choose option)",
    notes,
  };

  const row = quoteToSheetRow(quote);
  assert.match(row.quoteNumber, /^=HYPERLINK\(/);
  assert.match(row.clientName, /^=HYPERLINK\(/);
  assert.equal(row.lastSalesTouchBy, "Sean");
  assert.equal(row.lastNoteText, "second note updated later");
});

test("rowsToSheetValues includes header row", () => {
  const values = rowsToSheetValues([
    {
      quoteNumber: "111656",
      quoteTitle: "Boat trailer sandblast",
      clientName: "Marcelo Leao",
      draftCreated: "Apr 22, 2026 3:20 PM PDT",
      lastUpdated: "Apr 22, 2026 4:36 PM PDT",
      nativeSalesperson: "HQ - Sales - Alex Acevez",
      kcSalesRep: "Preliminary Estimate",
      leadSource: "(choose option)",
      quoteStatus: "draft",
      lastNoteCreatedAt: "2026-04-21T10:00:00Z",
      lastNoteEditedAt: "2026-04-22T12:00:00Z",
      lastSalesTouchAt: "2026-04-22T12:00:00Z",
      lastSalesTouchBy: "Sean",
      lastNoteText: "second note updated later",
      lastSalesTouchAtRaw: "2026-04-22T12:00:00Z",
    },
  ]);
  assert.equal(values[0][0], "Quote Number");
  assert.equal(values[1][0], "111656");
});

test("resolveLastTouch handles standard time as PST", () => {
  const winterResult = resolveLastTouch([
    {
      id: "n3",
      message: "winter note",
      createdAt: "2026-01-15T18:30:00Z",
      lastEditedAt: null,
      createdBy: { type: "User", name: "Alex" },
      lastEditedBy: null,
    },
  ]);

  assert.equal(winterResult.lastNoteCreatedAt, "Jan 15, 2026 10:30 AM PST");
  assert.equal(winterResult.lastSalesTouchAt, "Jan 15, 2026 10:30 AM PST");
});

test("resolveLastTouch marks quotes with no notes clearly", () => {
  const result = resolveLastTouch([]);

  assert.equal(result.lastNoteText, "No note found");
  assert.equal(result.lastSalesTouchAtRaw, "");
  assert.equal(result.lastSalesTouchAt, "");
});
