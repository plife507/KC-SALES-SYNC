import {
  JOBBER_ACCESS_TOKEN,
  JOBBER_API_URL,
  JOBBER_API_VERSION,
  JOBBER_NOTES_PAGE_SIZE,
  JOBBER_REQUEST_DELAY_MS,
  requireEnv,
} from "../config.js";
import type { DraftQuote, QuoteNote, QuoteNoteActor } from "../types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const NOTE_NODE_SELECTION = `
  ... on QuoteNote {
    id
    message
    createdAt
    lastEditedAt
    createdBy {
      __typename
      ... on User {
        id
        userName: name { full first last }
      }
      ... on Application {
        id
        applicationName: name
      }
      ... on Client {
        id
        clientName: name
      }
    }
    lastEditedBy {
      __typename
      ... on User {
        id
        userName: name { full first last }
      }
      ... on Application {
        id
        applicationName: name
      }
      ... on Client {
        id
        clientName: name
      }
    }
  }
`;

function actorFromNode(node: any): QuoteNoteActor | null {
  if (!node) return null;
  if (node.__typename === "User") {
    return {
      type: node.__typename,
      id: node.id,
      name: node.userName?.full ?? [node.userName?.first, node.userName?.last].filter(Boolean).join(" ").trim(),
    };
  }
  return {
    type: node.__typename ?? "Unknown",
    id: node.id,
    name: node.applicationName ?? node.clientName ?? node.displayName ?? "",
  };
}

function customFieldValue(field: any): string {
  if (typeof field?.valueText === "string") return field.valueText;
  if (typeof field?.valueDropdown === "string") return field.valueDropdown;
  if (typeof field?.valueNumeric === "number") return String(field.valueNumeric);
  if (typeof field?.valueTrueFalse === "boolean") return String(field.valueTrueFalse);
  if (field?.valueLink?.url) return field.valueLink.url;
  if (field?.valueArea) return [field.valueArea.length, field.valueArea.width].filter((v) => v != null).join(" x ");
  return "";
}

function mapQuoteNote(node: any): QuoteNote | null {
  if (typeof node?.message !== "string" || typeof node?.createdAt !== "string") return null;
  return {
    id: node.id,
    message: node.message,
    createdAt: node.createdAt,
    lastEditedAt: node.lastEditedAt ?? null,
    createdBy: actorFromNode(node.createdBy),
    lastEditedBy: actorFromNode(node.lastEditedBy),
  };
}

async function runJobberQuery<T>(query: string): Promise<T> {
  const token = JOBBER_ACCESS_TOKEN ?? requireEnv("JOBBER_ACCESS_TOKEN");
  const response = await fetch(JOBBER_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-jobber-graphql-version": JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Jobber request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; "));
  }
  if (payload.data == null) {
    throw new Error("Jobber response did not include data");
  }
  return payload.data;
}

function mapDraftQuote(node: any, notes: QuoteNote[]): DraftQuote {
  const customFields = new Map<string, string>();
  for (const field of node.customFields ?? []) {
    customFields.set(field.label, customFieldValue(field));
  }

  return {
    id: node.id,
    quoteNumber: node.quoteNumber,
    quoteStatus: node.quoteStatus,
    title: node.title ?? "",
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    quoteWebUri: node.jobberWebUri ?? "",
    clientName: node.client?.name ?? "",
    clientWebUri: node.client?.jobberWebUri ?? "",
    nativeSalesperson: node.salesperson?.name?.full ?? "",
    kcSalesRep: customFields.get("(S) KC Sales Rep") ?? "",
    leadSource: customFields.get("(S) Lead Source") ?? "",
    notes,
  } satisfies DraftQuote;
}

async function fetchQuoteNotesPage(
  quoteId: string,
  after?: string,
): Promise<{ notes: QuoteNote[]; hasNextPage: boolean; endCursor: string | null }> {
  const afterClause = after ? `, after: ${JSON.stringify(after)}` : "";
  const query = `query {
    quote(id: ${JSON.stringify(quoteId)}) {
      notes(
        first: ${JOBBER_NOTES_PAGE_SIZE}${afterClause}
        sort: [{ key: CREATED_AT, direction: DESC }]
      ) {
        nodes {
          ${NOTE_NODE_SELECTION}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`;

  const data = await runJobberQuery<{
    quote?: {
      notes?: {
        nodes?: any[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    } | null;
  }>(query);

  const connection = data.quote?.notes;
  const notes = (connection?.nodes ?? []).map(mapQuoteNote).filter((note): note is QuoteNote => note !== null);
  return {
    notes,
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
    endCursor: connection?.pageInfo?.endCursor ?? null,
  };
}

async function fetchAllQuoteNotes(
  quoteId: string,
  initialConnection: { nodes?: any[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } | null | undefined,
): Promise<QuoteNote[]> {
  const notes = (initialConnection?.nodes ?? []).map(mapQuoteNote).filter((note): note is QuoteNote => note !== null);
  let hasNextPage = Boolean(initialConnection?.pageInfo?.hasNextPage);
  let after = initialConnection?.pageInfo?.endCursor ?? undefined;

  while (hasNextPage && after) {
    await sleep(JOBBER_REQUEST_DELAY_MS);
    const page = await fetchQuoteNotesPage(quoteId, after);
    notes.push(...page.notes);
    hasNextPage = page.hasNextPage;
    after = page.endCursor ?? undefined;
  }

  const deduped = new Map<string, QuoteNote>();
  for (const note of notes) {
    deduped.set(note.id, note);
  }
  return Array.from(deduped.values());
}

async function fetchDraftQuotePage(
  first: number,
  after?: string,
): Promise<{ quotes: DraftQuote[]; hasNextPage: boolean; endCursor: string | null }> {
  const afterClause = after ? `, after: ${JSON.stringify(after)}` : "";
  const query = `query {
    quotes(first: ${first}${afterClause}, filter: { status: draft }) {
      nodes {
        id
        quoteNumber
        quoteStatus
        title
        createdAt
        updatedAt
        jobberWebUri
        client {
          name
          jobberWebUri
        }
        salesperson {
          id
          name { full first last }
        }
        customFields {
          ... on CustomFieldText { label valueText }
          ... on CustomFieldDropdown { label valueDropdown }
          ... on CustomFieldNumeric { label valueNumeric }
          ... on CustomFieldTrueFalse { label valueTrueFalse }
          ... on CustomFieldLink { label valueLink { url text } }
          ... on CustomFieldArea { label valueArea { length width } }
        }
        notes(
          first: ${JOBBER_NOTES_PAGE_SIZE}
          sort: [{ key: CREATED_AT, direction: DESC }]
        ) {
          nodes {
            ${NOTE_NODE_SELECTION}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;

  const data = await runJobberQuery<{
    quotes?: {
      nodes?: any[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  }>(query);

  const quoteNodes = data.quotes?.nodes ?? [];
  const quotes: DraftQuote[] = [];
  for (const node of quoteNodes) {
    const notes = await fetchAllQuoteNotes(node.id, node.notes);
    quotes.push(mapDraftQuote(node, notes));
  }

  return {
    quotes,
    hasNextPage: Boolean(data.quotes?.pageInfo?.hasNextPage),
    endCursor: data.quotes?.pageInfo?.endCursor ?? null,
  };
}

export async function fetchDraftQuotes(limit = 100, pageSize = 10): Promise<DraftQuote[]> {
  const quotes: DraftQuote[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage && quotes.length < limit) {
    const batchSize = Math.min(pageSize, limit - quotes.length);
    const page = await fetchDraftQuotePage(batchSize, after);
    quotes.push(...page.quotes);
    hasNextPage = page.hasNextPage;
    after = page.endCursor ?? undefined;
    if (hasNextPage) {
      await sleep(JOBBER_REQUEST_DELAY_MS);
    }
  }

  return quotes;
}
