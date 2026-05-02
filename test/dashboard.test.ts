import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboard } from "../src/dashboard.js";

test("dashboard does not mark no-touch unassigned quotes as overdue", () => {
  const payload = buildDashboard(
    [
      {
        quote_number: "111767",
        quote_title: "Google Inquiry: Sandblasting",
        client_name: "Bruno Ghonami",
        native_salesperson: "",
        kc_sales_rep: "Preliminary Estimate",
        lead_source: "(choose option)",
        quote_status: "draft",
        last_sales_touch_at: "",
        last_sales_touch_by: "",
        last_note_text: "No note found",
      },
    ],
    "sheet-id",
    "Draft Quote Sales Touch",
  );

  assert.equal(payload.metrics.overdue, 0);
  assert.equal(payload.metrics.attention, 1);
  assert.equal(payload.rows[0].rowTone, "attention");
  assert.equal(payload.rows[0].status, "No touch yet");
  assert.equal(payload.rows[0].daysSinceTouch, null);
  assert.equal(payload.rows[0].missingOwner, true);
});
