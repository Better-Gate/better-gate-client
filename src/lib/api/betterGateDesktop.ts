export interface BetterGateDesktopAuthStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface BetterGateDesktopUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export type BetterGateDesktopPollResponse =
  | { status: "pending" | "expired" | "denied" | "invalid" | "consumed" }
  | {
      status: "approved";
      accessToken: string;
      expiresAt: string;
      user: BetterGateDesktopUser;
    };

export interface BetterGateDesktopMeResponse {
  user: BetterGateDesktopUser;
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface BetterGateDesktopWorkspace {
  id: string;
  type: "personal" | "organization";
  name: string;
  logo?: string | null;
  role: string;
  memberId: string | null;
  canCreateApiKey: boolean;
  availableBalanceCents: number;
  currency: string;
  walletStatus: string;
}

export type BetterGateDesktopModelFamily = "GPT" | "CLAUDE" | "GEMINI";

export interface BetterGateDesktopApiKey {
  id: string;
  name: string;
  note: string | null;
  keyPrefix: string;
  routeGroup: string;
  routeGroupModelFamily?: BetterGateDesktopModelFamily | string | null;
  routeGroupDefaultModel?: string | null;
  status: string;
  hasStoredSecret: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface BetterGateDesktopRouteGroup {
  key: string;
  name: string;
  modelFamily?: BetterGateDesktopModelFamily | string | null;
  defaultModel?: string | null;
  isDefault?: boolean | null;
  priceMultiplierBps?: number | null;
}

export interface BetterGateDesktopWorkspacesResponse {
  workspaces: BetterGateDesktopWorkspace[];
}

export interface BetterGateDesktopApiKeysResponse {
  apiKeys: BetterGateDesktopApiKey[];
  routeGroups?: BetterGateDesktopRouteGroup[];
}

export interface BetterGateDesktopCreateApiKeyResponse {
  apiKey: BetterGateDesktopApiKey;
  secret: string;
}

export interface BetterGateDesktopRevealApiKeyResponse {
  secret: string | null;
  hasStoredSecret: boolean;
}

export interface BetterGateDesktopUsagePoint {
  key: string;
  requests: number;
  totalTokens: number;
  costCents: number;
}

export interface BetterGateDesktopUsageSummaryResponse {
  workspace: {
    id: string;
    type: "personal" | "organization";
    name: string;
    role: string;
    memberId?: string | null;
  };
  balance: {
    availableBalanceCents: number;
    workspaceBalanceCents: number;
    scope: "personal" | "organization" | "member_allocation";
  };
  usage: {
    today: BetterGateDesktopUsagePoint;
    month: {
      requests: number;
      totalTokens: number;
      costCents: number;
    };
    daily: BetterGateDesktopUsagePoint[];
  };
  timeZone: string;
}

const DEFAULT_SAAS_URL = "https://app.better-gate.com";
const BETTER_GATE_REQUEST_TIMEOUT_MS = 15_000;
const PREVIEW_TOKEN = "better-gate-dev-preview-token";

export const BETTER_GATE_DESKTOP_TOKEN_KEY = "better-gate:desktop-token";
export const BETTER_GATE_SAAS_URL_KEY = "better-gate:saas-url";
export const BETTER_GATE_DESKTOP_SIGNED_OUT_EVENT =
  "better-gate:desktop-signed-out";

export function getBetterGateSaasUrl() {
  const storedUrl = localStorage.getItem(BETTER_GATE_SAAS_URL_KEY)?.trim();

  if (
    storedUrl &&
    !storedUrl.includes("localhost") &&
    !storedUrl.includes("127.0.0.1")
  ) {
    return storedUrl.replace(/\/$/, "");
  }

  if (storedUrl) {
    localStorage.removeItem(BETTER_GATE_SAAS_URL_KEY);
  }

  return DEFAULT_SAAS_URL;
}

export function setBetterGateSaasUrl(url: string) {
  localStorage.setItem(BETTER_GATE_SAAS_URL_KEY, url.replace(/\/$/, ""));
}

export function getBetterGateDesktopToken() {
  if (isBetterGateDesktopPreview()) {
    return PREVIEW_TOKEN;
  }

  return localStorage.getItem(BETTER_GATE_DESKTOP_TOKEN_KEY);
}

export function setBetterGateDesktopToken(token: string) {
  localStorage.setItem(BETTER_GATE_DESKTOP_TOKEN_KEY, token);
}

export function clearBetterGateDesktopToken() {
  localStorage.removeItem(BETTER_GATE_DESKTOP_TOKEN_KEY);
  window.dispatchEvent(new Event(BETTER_GATE_DESKTOP_SIGNED_OUT_EVENT));
}

export function isBetterGateDesktopPreview() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("preview") === "dashboard";
}

const previewUser: BetterGateDesktopUser = {
  id: "preview-user",
  email: "max@better-gate.com",
  name: "Max",
  image: null,
};

const previewWorkspaces: BetterGateDesktopWorkspace[] = [
  {
    id: "preview-personal",
    type: "personal",
    name: "Max的工作区",
    logo: null,
    role: "owner",
    memberId: null,
    canCreateApiKey: true,
    availableBalanceCents: 1280,
    currency: "USD",
    walletStatus: "active",
  },
  {
    id: "preview-team",
    type: "organization",
    name: "Better Gate Team",
    logo: null,
    role: "owner",
    memberId: "preview-member",
    canCreateApiKey: true,
    availableBalanceCents: 6080,
    currency: "USD",
    walletStatus: "active",
  },
];

const previewApiKeys: BetterGateDesktopApiKey[] = [
  {
    id: "preview-key-codex",
    name: "Codex 本地接入",
    note: "用于桌面客户端预览",
    keyPrefix: "bg_live_preview",
    routeGroup: "enterprise",
    routeGroupModelFamily: "GPT",
    routeGroupDefaultModel: "gpt-5.5",
    status: "ACTIVE",
    hasStoredSecret: true,
    lastUsedAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: "preview-key-claude",
    name: "Claude Code",
    note: null,
    keyPrefix: "bg_live_claude",
    routeGroup: "relay",
    routeGroupModelFamily: "CLAUDE",
    routeGroupDefaultModel: "claude-sonnet-4.5",
    status: "ACTIVE",
    hasStoredSecret: true,
    lastUsedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  },
];

const previewRouteGroups: BetterGateDesktopRouteGroup[] = [
  {
    key: "standard",
    name: "标准分组",
    modelFamily: "GPT",
    defaultModel: "gpt-5.5",
    isDefault: true,
    priceMultiplierBps: 10_000,
  },
  {
    key: "relay",
    name: "高速分组",
    modelFamily: "CLAUDE",
    defaultModel: "claude-sonnet-4.5",
    isDefault: false,
    priceMultiplierBps: 8_000,
  },
];

function buildPreviewUsageSummary(input: {
  workspaceId: string;
  days?: number;
  timeZone?: string;
}): BetterGateDesktopUsageSummaryResponse {
  const workspace =
    previewWorkspaces.find((item) => item.id === input.workspaceId) ??
    previewWorkspaces[0];
  const days = input.days ?? 14;
  const daily = Array.from({ length: days }, (_, index) => {
    const dayOffset = days - index - 1;
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const requests = Math.round(8 + index * 3 + Math.sin(index) * 8);
    const totalTokens = Math.max(0, requests * 2650 + index * 800);
    const costCents = Math.round(totalTokens / 100000);

    return {
      key: date.toISOString().slice(0, 10),
      requests,
      totalTokens,
      costCents,
    };
  });
  const today = daily[daily.length - 1] ?? {
    key: new Date().toISOString().slice(0, 10),
    requests: 0,
    totalTokens: 0,
    costCents: 0,
  };
  const month = daily.reduce(
    (acc, point) => ({
      requests: acc.requests + point.requests,
      totalTokens: acc.totalTokens + point.totalTokens,
      costCents: acc.costCents + point.costCents,
    }),
    { requests: 0, totalTokens: 0, costCents: 0 },
  );

  return {
    workspace: {
      id: workspace.id,
      type: workspace.type,
      name: workspace.name,
      role: workspace.role,
      memberId: workspace.memberId,
    },
    balance: {
      availableBalanceCents: workspace.availableBalanceCents,
      workspaceBalanceCents: workspace.availableBalanceCents,
      scope: workspace.type === "organization" ? "organization" : "personal",
    },
    usage: {
      today,
      month,
      daily,
    },
    timeZone:
      input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : `Better Gate request failed: ${response.status}`,
    );
  }

  return data as T;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    BETTER_GATE_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Better Gate request timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function startBetterGateDesktopLogin(
  baseUrl = getBetterGateSaasUrl(),
) {
  const response = await fetchWithTimeout(`${baseUrl}/api/desktop-auth/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseJsonResponse<BetterGateDesktopAuthStartResponse>(response);
}

export async function pollBetterGateDesktopLogin(
  deviceCode: string,
  baseUrl = getBetterGateSaasUrl(),
) {
  const response = await fetchWithTimeout(`${baseUrl}/api/desktop-auth/poll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deviceCode }),
  });

  return parseJsonResponse<BetterGateDesktopPollResponse>(response);
}

export async function getBetterGateDesktopMe(
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return {
      user: previewUser,
      session: {
        id: "preview-session",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      },
    };
  }

  if (!token) {
    throw new Error("Missing Better Gate desktop token");
  }

  const response = await fetchWithTimeout(`${baseUrl}/api/desktop-auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseJsonResponse<BetterGateDesktopMeResponse>(response);
}

function getAuthorizedHeaders(token = getBetterGateDesktopToken()) {
  if (!token) {
    throw new Error("Missing Better Gate desktop token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function listBetterGateDesktopWorkspaces(
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return { workspaces: previewWorkspaces };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/api/desktop-auth/workspaces`,
    {
      headers: getAuthorizedHeaders(token),
    },
  );

  return parseJsonResponse<BetterGateDesktopWorkspacesResponse>(response);
}

export async function listBetterGateDesktopApiKeys(
  workspaceId: string,
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return { apiKeys: previewApiKeys, routeGroups: previewRouteGroups };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/api/desktop-auth/api-keys?workspaceId=${encodeURIComponent(
      workspaceId,
    )}`,
    {
      headers: getAuthorizedHeaders(token),
    },
  );

  return parseJsonResponse<BetterGateDesktopApiKeysResponse>(response);
}

export async function createBetterGateDesktopApiKey(
  input: {
    workspaceId: string;
    name: string;
    tool?: string;
    routeGroup?: string;
  },
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return {
      apiKey: {
        ...previewApiKeys[0],
        id: `preview-key-${Date.now()}`,
        name: input.name,
        routeGroup:
          input.routeGroup || previewRouteGroups[0]?.key || "standard",
        routeGroupModelFamily:
          previewRouteGroups.find((group) => group.key === input.routeGroup)
            ?.modelFamily ??
          previewRouteGroups[0]?.modelFamily ??
          "GPT",
        routeGroupDefaultModel:
          previewRouteGroups.find((group) => group.key === input.routeGroup)
            ?.defaultModel ??
          previewRouteGroups[0]?.defaultModel ??
          "gpt-5.5",
        createdAt: new Date().toISOString(),
      },
      secret: "bg_live_preview_secret_only_for_dev",
    };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/api/desktop-auth/api-keys`,
    {
      method: "POST",
      headers: {
        ...getAuthorizedHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  return parseJsonResponse<BetterGateDesktopCreateApiKeyResponse>(response);
}

export async function revealBetterGateDesktopApiKey(
  input: {
    workspaceId: string;
    apiKeyId: string;
  },
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return {
      secret: "bg_live_preview_secret_only_for_dev",
      hasStoredSecret: true,
    };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/api/desktop-auth/api-keys/secret`,
    {
      method: "POST",
      headers: {
        ...getAuthorizedHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  return parseJsonResponse<BetterGateDesktopRevealApiKeyResponse>(response);
}

export async function getBetterGateDesktopUsageSummary(
  input: {
    workspaceId: string;
    days?: number;
    timeZone?: string;
  },
  token = getBetterGateDesktopToken(),
  baseUrl = getBetterGateSaasUrl(),
) {
  if (isBetterGateDesktopPreview()) {
    return buildPreviewUsageSummary(input);
  }

  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    days: String(input.days ?? 14),
  });

  if (input.timeZone) {
    params.set("timeZone", input.timeZone);
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/api/desktop-auth/usage-summary?${params.toString()}`,
    {
      headers: getAuthorizedHeaders(token),
    },
  );

  return parseJsonResponse<BetterGateDesktopUsageSummaryResponse>(response);
}
