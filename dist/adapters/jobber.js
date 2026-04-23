import { requireEnv, runtimeConfig } from "../config.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_PAGE_SIZE = 10;
const DEFAULT_QUERY_COST = 500;
class SimpleThrottleManager {
    status = {
        maximumAvailable: 10000,
        currentlyAvailable: 10000,
        restoreRate: 500,
    };
    update(response) {
        const throttle = response.extensions?.cost?.throttleStatus ?? response.extensions?.throttleStatus;
        if (!throttle)
            return;
        this.status = {
            maximumAvailable: throttle.maximumAvailable,
            currentlyAvailable: throttle.currentlyAvailable,
            restoreRate: throttle.restoreRate,
        };
    }
    async waitIfNeeded(requiredUnits) {
        const effectiveRate = this.status.restoreRate > 0 ? this.status.restoreRate : 500;
        const deficit = requiredUnits - this.status.currentlyAvailable;
        if (deficit <= 0)
            return;
        const waitSeconds = Math.min(Math.ceil((deficit / effectiveRate) * 1.1), 3600);
        console.log(`Jobber budget low: ${this.status.currentlyAvailable}/${this.status.maximumAvailable} available, waiting ${waitSeconds}s for ~${requiredUnits} units`);
        await sleep(waitSeconds * 1000);
        const restored = waitSeconds * effectiveRate;
        this.status.currentlyAvailable = Math.min(this.status.maximumAvailable, this.status.currentlyAvailable + restored);
    }
}
const throttleManager = new SimpleThrottleManager();
let cachedAccessToken = runtimeConfig.jobber.accessToken;
let cachedRefreshToken = runtimeConfig.jobber.refreshToken;
function decodeJwtExp(token) {
    try {
        const [, payload] = token.split(".");
        if (!payload)
            return null;
        const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return typeof parsed.exp === "number" ? parsed.exp : null;
    }
    catch {
        return null;
    }
}
function isTokenExpired(token) {
    if (!token)
        return true;
    const exp = decodeJwtExp(token);
    if (!exp)
        return false;
    return Date.now() >= (exp - 300) * 1000;
}
async function refreshJobberAccessToken() {
    const clientId = runtimeConfig.jobber.clientId ?? requireEnv("JOBBER_CLIENT_ID");
    const clientSecret = runtimeConfig.jobber.clientSecret ?? requireEnv("JOBBER_CLIENT_SECRET");
    const refreshToken = cachedRefreshToken ?? requireEnv("JOBBER_REFRESH_TOKEN");
    const response = await fetch("https://api.getjobber.com/api/oauth/token", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });
    if (!response.ok) {
        throw new Error(`Jobber token refresh failed (${response.status}): ${await response.text()}`);
    }
    const payload = (await response.json());
    if (!payload.access_token) {
        throw new Error("Jobber token refresh response missing access_token");
    }
    cachedAccessToken = payload.access_token;
    if (payload.refresh_token) {
        cachedRefreshToken = payload.refresh_token;
    }
    return cachedAccessToken;
}
async function getJobberAccessToken() {
    if (!isTokenExpired(cachedAccessToken)) {
        return cachedAccessToken;
    }
    return refreshJobberAccessToken();
}
const NOTE_ACTOR_SELECTION = `
  __typename
  ... on User {
    id
    userName: name { full first last }
  }
`;
const NOTE_NODE_SELECTION = `
  ... on ClientNote {
    id
    message
    createdAt
    lastEditedAt
    createdBy {
      ${NOTE_ACTOR_SELECTION}
    }
    lastEditedBy {
      ${NOTE_ACTOR_SELECTION}
    }
  }
  ... on QuoteNote {
    id
    message
    createdAt
    lastEditedAt
    createdBy {
      ${NOTE_ACTOR_SELECTION}
    }
    lastEditedBy {
      ${NOTE_ACTOR_SELECTION}
    }
  }
  ... on RequestNote {
    id
    message
    createdAt
    lastEditedAt
    createdBy {
      ${NOTE_ACTOR_SELECTION}
    }
    lastEditedBy {
      ${NOTE_ACTOR_SELECTION}
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
        name: "",
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
    if (!node?.id || typeof node.message !== "string" || typeof node.createdAt !== "string")
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
function isAuthError(status, errors) {
    if (status === 401 || status === 403)
        return true;
    return errors.some((message) => /(unauthorized|unauthenticated|forbidden|token)/i.test(message));
}
function isThrottledError(errors) {
    return errors.some((message) => /thrott/i.test(message));
}
async function fetchJobberResponse(query, token) {
    const response = await fetch(runtimeConfig.jobber.apiUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "x-jobber-graphql-version": runtimeConfig.jobber.apiVersion,
        },
        body: JSON.stringify({ query }),
    });
    const body = await response.text();
    let payload;
    try {
        payload = JSON.parse(body);
    }
    catch {
        if (!response.ok) {
            throw new Error(`Jobber request failed (${response.status}): ${body}`);
        }
        throw new Error(`Jobber API returned non-JSON: ${body.slice(0, 200)}`);
    }
    throttleManager.update(payload);
    return { status: response.status, payload, body };
}
async function runJobberQuery(query) {
    const estimatedCost = DEFAULT_QUERY_COST;
    await throttleManager.waitIfNeeded(estimatedCost);
    const attempt = async (token) => {
        const { status, payload, body } = await fetchJobberResponse(query, token);
        const errors = payload.errors?.map((error) => error.message ?? "Unknown GraphQL error") ?? [];
        if (!payload.data && isThrottledError(errors)) {
            return {
                kind: "throttled",
                requestedCost: payload.extensions?.cost?.requestedQueryCost ?? estimatedCost,
                errors,
            };
        }
        if (!payload.data && (status >= 400 || isAuthError(status, errors))) {
            return {
                kind: "auth",
                status,
                body,
                errors,
            };
        }
        if (status >= 400) {
            throw new Error(`Jobber request failed (${status}): ${body}`);
        }
        if (errors.length) {
            if (isThrottledError(errors)) {
                return {
                    kind: "throttled",
                    requestedCost: payload.extensions?.cost?.requestedQueryCost ?? estimatedCost,
                    errors,
                };
            }
            throw new Error(errors.join("; "));
        }
        if (payload.data == null) {
            throw new Error("Jobber response did not include data");
        }
        return {
            kind: "ok",
            data: payload.data,
        };
    };
    let token = await getJobberAccessToken();
    let result = await attempt(token);
    if (result.kind === "auth") {
        token = await refreshJobberAccessToken();
        result = await attempt(token);
    }
    if (result.kind === "throttled") {
        console.log(`Jobber throttled. Waiting for budget recovery (~${result.requestedCost} units)...`);
        await throttleManager.waitIfNeeded(result.requestedCost);
        result = await attempt(token);
        if (result.kind === "throttled") {
            throw new Error(`Jobber THROTTLED on retry: ${result.errors.join("; ")}`);
        }
        if (result.kind === "auth") {
            token = await refreshJobberAccessToken();
            result = await attempt(token);
        }
    }
    if (result.kind !== "ok") {
        throw new Error(result.errors.join("; ") || "Jobber query failed");
    }
    return result.data;
}
function mapDraftQuote(node, notes) {
    const customFields = new Map();
    for (const field of node.customFields ?? []) {
        if (field.label) {
            customFields.set(field.label, customFieldValue(field));
        }
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
        first: ${runtimeConfig.jobber.notesPageSize}${afterClause}
        sort: [{ key: CREATED_AT, direction: DESCENDING }]
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
        await sleep(runtimeConfig.jobber.requestDelayMs);
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
          first: ${runtimeConfig.jobber.notesPageSize}
          sort: [{ key: CREATED_AT, direction: DESCENDING }]
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
export async function fetchDraftQuotes(limit = runtimeConfig.sync.quoteLimit, pageSize = runtimeConfig.sync.quotePageSize) {
    const quotes = [];
    let after;
    let hasNextPage = true;
    while (hasNextPage && quotes.length < limit) {
        const batchSize = Math.min(Math.min(pageSize, MAX_PAGE_SIZE), limit - quotes.length);
        const page = await fetchDraftQuotePage(batchSize, after);
        quotes.push(...page.quotes);
        hasNextPage = page.hasNextPage;
        after = page.endCursor ?? undefined;
        if (hasNextPage) {
            await sleep(runtimeConfig.jobber.requestDelayMs);
        }
    }
    return quotes;
}
