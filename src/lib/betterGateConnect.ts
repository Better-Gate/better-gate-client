import type { AppId } from "@/lib/api/types";
import type {
  BetterGateDesktopApiKey,
  BetterGateDesktopModelFamily,
  BetterGateDesktopUser,
  BetterGateDesktopWorkspace,
} from "@/lib/api/betterGateDesktop";
import type { Provider } from "@/types";

const BETTER_GATE_BASE_URL = "https://gateway.better-gate.com";
const BETTER_GATE_OPENAI_BASE_URL = `${BETTER_GATE_BASE_URL}/v1`;
const BETTER_GATE_HOME_URL = "https://better-gate.com";
const DEFAULT_CODE_MODEL = "gpt-5.5";
const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-4-6";
const DEFAULT_CLAUDE_OPUS_MODEL = "claude-opus-4-8";
const DEFAULT_CLAUDE_HAIKU_MODEL = "claude-haiku-4-5";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";

export function normalizeBetterGateModelFamily(
  value?: string | null,
): BetterGateDesktopModelFamily {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "claude" || normalized?.includes("claude")) {
    return "CLAUDE";
  }
  if (normalized === "gemini" || normalized?.includes("gemini")) {
    return "GEMINI";
  }

  return "GPT";
}

export function normalizeBetterGateDefaultModel(value?: string | null): string {
  const normalized = value?.trim();

  if (!normalized || normalized === "GPT") {
    return DEFAULT_CODE_MODEL;
  }
  if (normalized === "CLAUDE") {
    return DEFAULT_CLAUDE_SONNET_MODEL;
  }
  if (normalized === "GEMINI") {
    return DEFAULT_GEMINI_MODEL;
  }

  return normalized;
}

export function getBetterGateApiKeyDefaultModel(
  apiKey: Pick<
    BetterGateDesktopApiKey,
    "routeGroupDefaultModel" | "routeGroupModelFamily"
  >,
): string {
  return normalizeBetterGateDefaultModel(
    apiKey.routeGroupDefaultModel ?? apiKey.routeGroupModelFamily,
  );
}

function getBetterGateClaudeRoleModels(value?: string | null) {
  const normalized = value?.trim();
  const primaryModel = normalizeBetterGateDefaultModel(normalized);

  if (normalized === "CLAUDE") {
    return {
      primaryModel,
      sonnetModel: DEFAULT_CLAUDE_SONNET_MODEL,
      opusModel: DEFAULT_CLAUDE_OPUS_MODEL,
      haikuModel: DEFAULT_CLAUDE_HAIKU_MODEL,
    };
  }

  return {
    primaryModel,
    sonnetModel: primaryModel,
    opusModel: primaryModel,
    haikuModel: primaryModel,
  };
}

export function formatBetterGateBalance(units: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(units / 10_000);
}

function getBetterGatePersonalWorkspaceTitle(
  user?: BetterGateDesktopUser | null,
) {
  const name = user?.name?.trim();
  if (name) {
    return `${name}的工作区`;
  }

  const emailName = user?.email?.split("@")[0]?.trim();
  return emailName ? `${emailName}的工作区` : "我的工作区";
}

export function getBetterGateWorkspaceTitle(
  workspace: BetterGateDesktopWorkspace,
  user?: BetterGateDesktopUser | null,
) {
  return workspace.type === "personal"
    ? getBetterGatePersonalWorkspaceTitle(user)
    : workspace.name;
}

const toolTitles: Partial<Record<AppId, string>> = {
  claude: "Claude Code",
  "claude-desktop": "Claude Desktop",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes",
};

export function getBetterGateDefaultKeyName(toolId: AppId) {
  return `${toolTitles[toolId] ?? "Better Gate"} 接入 Key`;
}

export function getBetterGateApiKeyStatus(apiKey: BetterGateDesktopApiKey) {
  if (apiKey.status !== "ACTIVE") {
    return "已停用";
  }

  if (!apiKey.hasStoredSecret) {
    return "无完整 Key";
  }

  return "可导入";
}

export function isBetterGateApiKeyDirectlyImportable(
  apiKey: BetterGateDesktopApiKey | null | undefined,
) {
  return Boolean(
    apiKey && apiKey.status === "ACTIVE" && apiKey.hasStoredSecret,
  );
}

export function sortBetterGateApiKeys(apiKeys: BetterGateDesktopApiKey[]) {
  return [...apiKeys].sort((a, b) => {
    const aRank = isBetterGateApiKeyDirectlyImportable(a)
      ? 0
      : a.status === "ACTIVE"
        ? 1
        : 2;
    const bRank = isBetterGateApiKeyDirectlyImportable(b)
      ? 0
      : b.status === "ACTIVE"
        ? 1
        : 2;

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function createProviderId(toolId: AppId, apiKeyId: string) {
  return `better-gate-${toolId}-${apiKeyId}`;
}

type BetterGateProviderContext = {
  user?: Pick<BetterGateDesktopUser, "id"> | null;
  workspace?: Pick<BetterGateDesktopWorkspace, "id" | "type" | "memberId"> | null;
  apiKeyId?: string | null;
};

function createBetterGateProviderBinding(input: {
  user: BetterGateDesktopUser;
  workspace: BetterGateDesktopWorkspace;
  apiKey: BetterGateDesktopApiKey;
}): NonNullable<Provider["meta"]>["betterGate"] {
  return {
    userId: input.user.id,
    workspaceId: input.workspace.id,
    workspaceType: input.workspace.type,
    memberId: input.workspace.memberId ?? null,
    apiKeyId: input.apiKey.id,
  };
}

export function isBetterGateProvider(provider?: {
  id: string;
  icon?: string;
  notes?: string;
} | null) {
  return Boolean(
    provider &&
      (provider.id.startsWith("better-gate-") ||
        provider.icon === "bettergate" ||
        provider.notes?.includes("Better Gate")),
  );
}

export function isBetterGateProviderForContext(
  provider: (Pick<Provider, "id" | "icon" | "notes" | "meta">) | null | undefined,
  context: BetterGateProviderContext,
) {
  if (!provider || !context.user || !context.workspace) {
    return false;
  }

  if (!isBetterGateProvider(provider)) {
    return false;
  }

  const binding = provider.meta?.betterGate;
  if (!binding) {
    return false;
  }

  if (
    binding.userId !== context.user.id ||
    binding.workspaceId !== context.workspace.id ||
    binding.workspaceType !== context.workspace.type
  ) {
    return false;
  }

  if (
    context.workspace.type === "organization" &&
    (binding.memberId ?? null) !== (context.workspace.memberId ?? null)
  ) {
    return false;
  }

  if (context.apiKeyId && binding.apiKeyId !== context.apiKeyId) {
    return false;
  }

  return true;
}

function tomlString(value: string) {
  return JSON.stringify(value);
}

function createCommonMeta(
  now: number,
  owner: {
    user: BetterGateDesktopUser;
    workspace: BetterGateDesktopWorkspace;
    apiKey: BetterGateDesktopApiKey;
  },
  extra?: Provider["meta"],
  baseUrl = BETTER_GATE_BASE_URL,
): Provider["meta"] {
  return {
    ...(extra ?? {}),
    betterGate: createBetterGateProviderBinding(owner),
    custom_endpoints: {
      [baseUrl]: {
        url: baseUrl,
        addedAt: now,
      },
    },
  };
}

export function createBetterGateProvider(input: {
  toolId: AppId;
  user: BetterGateDesktopUser;
  workspace: BetterGateDesktopWorkspace;
  apiKey: BetterGateDesktopApiKey;
  secret: string;
}): Provider {
  const now = Date.now();
  const providerName = input.apiKey.name || "Better Gate";
  const providerId = createProviderId(input.toolId, input.apiKey.id);
  const primaryModel = getBetterGateApiKeyDefaultModel(input.apiKey);
  const { sonnetModel, opusModel, haikuModel } = getBetterGateClaudeRoleModels(
    input.apiKey.routeGroupDefaultModel ?? input.apiKey.routeGroupModelFamily,
  );
  const baseProvider: Omit<Provider, "settingsConfig"> = {
    id: providerId,
    name: providerName,
    websiteUrl: BETTER_GATE_HOME_URL,
    category: "aggregator",
    icon: "bettergate",
    iconColor: "#111827",
    notes: "通过 Better Gate 桌面客户端导入。",
    createdAt: now,
    sortIndex: now,
  };

  if (input.toolId === "codex") {
    return {
      ...baseProvider,
      settingsConfig: {
        auth: {
          OPENAI_API_KEY: input.secret,
        },
        config: `model_provider = "bettergate"
model = ${tomlString(primaryModel)}
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.bettergate]
name = ${tomlString(providerName)}
base_url = ${tomlString(BETTER_GATE_OPENAI_BASE_URL)}
wire_api = "responses"
requires_openai_auth = true`,
      },
      meta: createCommonMeta(
        now,
        input,
        {
          apiFormat: "openai_responses",
          isFullUrl: false,
        },
        BETTER_GATE_OPENAI_BASE_URL,
      ),
    };
  }

  if (input.toolId === "gemini") {
    return {
      ...baseProvider,
      settingsConfig: {
        env: {
          GEMINI_API_KEY: input.secret,
          GOOGLE_GEMINI_BASE_URL: BETTER_GATE_BASE_URL,
          GEMINI_MODEL: primaryModel,
        },
      },
      meta: createCommonMeta(now, input, {
        apiFormat: "gemini_native",
        isFullUrl: false,
      }),
    };
  }

  if (input.toolId === "opencode") {
    return {
      ...baseProvider,
      settingsConfig: {
        npm: "@ai-sdk/openai-compatible",
        name: providerName,
        options: {
          baseURL: BETTER_GATE_OPENAI_BASE_URL,
          apiKey: input.secret,
        },
        models: {
          [primaryModel]: { name: primaryModel },
          [sonnetModel]: { name: sonnetModel },
        },
      },
      meta: createCommonMeta(
        now,
        input,
        {
          isFullUrl: false,
        },
        BETTER_GATE_OPENAI_BASE_URL,
      ),
    };
  }

  if (input.toolId === "openclaw") {
    return {
      ...baseProvider,
      settingsConfig: {
        baseUrl: BETTER_GATE_OPENAI_BASE_URL,
        apiKey: input.secret,
        api: "openai-completions",
        models: [
          { id: primaryModel, name: primaryModel },
          { id: sonnetModel, name: sonnetModel },
        ],
      },
      meta: createCommonMeta(
        now,
        input,
        {
          isFullUrl: false,
        },
        BETTER_GATE_OPENAI_BASE_URL,
      ),
    };
  }

  if (input.toolId === "hermes") {
    return {
      ...baseProvider,
      settingsConfig: {
        name: providerName,
        base_url: BETTER_GATE_OPENAI_BASE_URL,
        api_key: input.secret,
        api_mode: "chat_completions",
        models: [
          { id: primaryModel, name: primaryModel },
          { id: sonnetModel, name: sonnetModel },
        ],
      },
      meta: createCommonMeta(
        now,
        input,
        {
          isFullUrl: false,
        },
        BETTER_GATE_OPENAI_BASE_URL,
      ),
    };
  }

  return {
    ...baseProvider,
    settingsConfig: {
      env: {
        ANTHROPIC_AUTH_TOKEN: input.secret,
        ANTHROPIC_BASE_URL: BETTER_GATE_BASE_URL,
        ANTHROPIC_MODEL: primaryModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
      },
    },
    meta: createCommonMeta(now, input, {
      apiFormat: "anthropic",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
      claudeDesktopMode:
        input.toolId === "claude-desktop" ? "direct" : undefined,
      isFullUrl: false,
    }),
  };
}
