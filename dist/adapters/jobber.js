import { JOBBER_ACCESS_TOKEN, JOBBER_API_URL, JOBBER_API_VERSION, JOBBER_NOTES_PAGE_SIZE, JOBBER_REQUEST_DELAY_MS, requireEnv, } from "../config.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
function actorFromNode(node) {
    if (!node)
        return null;
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
function customFieldValue(field) {
    if (typeof field?.valueText === "string")
        return field.valueText;
    if (typeof field?.valueDropdown === "string")
        return field.valueDropdown;
    if (typeof field?.valueNumeric === "number")
        return String(field.valueNumeric);
    if (typeof field?.valueTrueFalse === "boolean")
        return String(field.valueTrueFalse);
    if (field?.valueLink?.url)
        return field.valueLink.url;
    if (field?.valueArea)
        return [field.valueArea.length, field.valueArea.width].filter((v) => v != null).join(" x ");
    return "";
}
function mapQuoteNote(node) {
    if (typeof node?.message !== "string" || typeof node?.createdAt !== "string")
        return null;
    return {
        id: node.id,
        message: node.message,
        createdAt: node.createdAt,
        lastEditedAt: node.lastEditedAt ?? null,
        createdBy: actorFromNode(node.createdBy),
        lastEditedBy: actorFromNode(node.lastEditedBy),
    };
}
async function runJobberQuery(query) {
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
    const payload = (await response.json());
    if (payload.errors?.length) {
        throw new Error(payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; "));
    }
    if (payload.data == null) {
        throw new Error("Jobber response did not include data");
    }
    return payload.data;
}
function mapDraftQuote(node, notes) {
    const customFields = new Map();
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
    };
}
async function fetchQuoteNotesPage(quoteId, after) {
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
    const data = await runJobberQuery(query);
    const connection = data.quote?.notes;
    const notes = (connection?.nodes ?? []).map(mapQuoteNote).filter((note) => note !== null);
    return {
        notes,
        hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
        endCursor: connection?.pageInfo?.endCursor ?? null,
    };
}
async function fetchAllQuoteNotes(quoteId, initialConnection) {
    const notes = (initialConnection?.nodes ?? []).map(mapQuoteNote).filter((note) => note !== null);
    let hasNextPage = Boolean(initialConnection?.pageInfo?.hasNextPage);
    let after = initialConnection?.pageInfo?.endCursor ?? undefined;
    while (hasNextPage && after) {
        await sleep(JOBBER_REQUEST_DELAY_MS);
        const page = await fetchQuoteNotesPage(quoteId, after);
        notes.push(...page.notes);
        hasNextPage = page.hasNextPage;
        after = page.endCursor ?? undefined;
    }
    const deduped = new Map();
    for (const note of notes) {
        deduped.set(note.id, note);
    }
    return Array.from(deduped.values());
}
async function fetchDraftQuotePage(first, after) {
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
    const data = await runJobberQuery(query);
    const quoteNodes = data.quotes?.nodes ?? [];
    const quotes = [];
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
export async function fetchDraftQuotes(limit = 100, pageSize = 10) {
    const quotes = [];
    let after;
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
