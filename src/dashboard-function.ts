import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Request, Response } from "@google-cloud/functions-framework";

import { buildDashboardData } from "./dashboard.js";

type DashboardRequestBody = {
  spreadsheetId?: string;
  tabName?: string;
};

const dashboardHtmlPath = resolve(process.cwd(), "dashboard", "index.html");
let cachedDashboardHtml: string | null = null;

async function getDashboardHtml() {
  if (cachedDashboardHtml) return cachedDashboardHtml;
  cachedDashboardHtml = await readFile(dashboardHtmlPath, "utf8");
  return cachedDashboardHtml;
}

function requestPath(req: Request): string {
  return (req.path || req.url || "/").split("?")[0] || "/";
}

function parseBody(req: Request): DashboardRequestBody {
  if (req.body && typeof req.body === "object") {
    return req.body as DashboardRequestBody;
  }
  return {};
}

function setNoCache(res: Response) {
  res.set("Cache-Control", "no-store, max-age=0");
}

async function sendDashboardData(res: Response, options?: DashboardRequestBody) {
  const payload = await buildDashboardData({ spreadsheetId: options?.spreadsheetId, tabName: options?.tabName });
  setNoCache(res);
  res.status(200).json(payload);
}

async function sendDashboardScript(res: Response, options?: DashboardRequestBody) {
  const payload = await buildDashboardData({ spreadsheetId: options?.spreadsheetId, tabName: options?.tabName });
  setNoCache(res);
  res.type("application/javascript").status(200).send(`window.__KC_DASHBOARD_DATA__ = ${JSON.stringify(payload, null, 2)};\n`);
}

export async function kcSalesDashboard(req: Request, res: Response) {
  const path = requestPath(req);

  try {
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      setNoCache(res);
      res.type("text/html").status(200).send(await getDashboardHtml());
      return;
    }

    if (req.method === "GET" && path === "/healthz") {
      res.status(200).json({ status: "ok" });
      return;
    }

    if (req.method === "GET" && (path === "/data/live-data.json" || path === "/api/data")) {
      await sendDashboardData(res);
      return;
    }

    if (req.method === "GET" && path === "/data/live-data.js") {
      await sendDashboardScript(res);
      return;
    }

    if (req.method === "POST" && path === "/api/refresh") {
      await sendDashboardData(res, parseBody(req));
      return;
    }

    if (req.method === "GET" && path === "/favicon.ico") {
      res.status(204).end();
      return;
    }

    res.status(404).json({ error: `Not found: ${req.method} ${path}` });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
