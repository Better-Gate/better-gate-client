import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { APP_ICON_MAP } from "@/config/appConfig";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClaudeFormFields } from "@/components/providers/forms/ClaudeFormFields";
import { CodexFormFields } from "@/components/providers/forms/CodexFormFields";
import { GeminiFormFields } from "@/components/providers/forms/GeminiFormFields";
import { OpenCodeFormFields } from "@/components/providers/forms/OpenCodeFormFields";
import { OpenClawFormFields } from "@/components/providers/forms/OpenClawFormFields";
import { HermesFormFields } from "@/components/providers/forms/HermesFormFields";
import {
  type ClaudeModelEnvField,
} from "@/components/providers/forms/hooks/useModelState";
import { opencodeNpmPackages } from "@/config/opencodeProviderPresets";
import { openclawApiProtocols } from "@/config/openclawProviderPresets";
import {
  hermesApiModes,
  type HermesApiMode,
  type HermesModel,
} from "@/config/hermesProviderPresets";
import { copyText } from "@/lib/clipboard";
import {
  createBetterGateProvider,
  getBetterGateApiKeyStatus,
  getBetterGateDefaultKeyName,
  getBetterGateWorkspaceTitle,
  isBetterGateApiKeyDirectlyImportable,
  normalizeBetterGateDefaultModel,
  normalizeBetterGateModelFamily,
  sortBetterGateApiKeys,
} from "@/lib/betterGateConnect";
import {
  createBetterGateDesktopApiKey,
  listBetterGateDesktopApiKeys,
  revealBetterGateDesktopApiKey,
  type BetterGateDesktopApiKey,
  type BetterGateDesktopRouteGroup,
  type BetterGateDesktopUser,
  type BetterGateDesktopWorkspace,
} from "@/lib/api/betterGateDesktop";
import { providersApi } from "@/lib/api/providers";
import type { AppId } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type {
  ClaudeApiFormat,
  ClaudeApiKeyField,
  CodexApiFormat,
  CodexCatalogModel,
  CodexChatReasoning,
  OpenClawModel,
  OpenCodeModel,
  Provider,
} from "@/types";

type ToolOption = {
  id: AppId;
  title: string;
};

type CreateMode = "select" | "import";

type ToolConnectStatus = {
  configured: boolean;
  name?: string;
};

type ManualConfigField = {
  label: string;
  value: string;
};

type ManualConfigDraft = {
  providerKey: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  primaryModel: string;
  primaryDisplayName: string;
  sonnetModel: string;
  sonnetDisplayName: string;
  sonnetSupportsOneM: string;
  opusModel: string;
  opusDisplayName: string;
  opusSupportsOneM: string;
  haikuModel: string;
  haikuDisplayName: string;
  fallbackModel: string;
  apiFormat: string;
  apiKeyField: string;
  claudeDesktopMode: string;
  opencodeNpm: string;
  opencodeModels: string;
  opencodeExtraOptions: string;
  apiType: string;
  openclawModels: string;
  openclawUserAgent: string;
  apiMode: string;
  hermesModels: string;
  hermesRateLimitDelay: string;
  geminiConfig: string;
  codexProviderId: string;
  codexModelCatalog: string;
};

type ManualEditableField = {
  key: keyof ManualConfigDraft;
  label: string;
  type?: "text" | "password" | "select" | "textarea";
  options?: Array<{ value: string; label: string }>;
};

type ManualConfigSection = {
  title: string;
  description?: string;
  content: string;
};

interface BetterGateToolConnectPageProps {
  tool: ToolOption;
  user: BetterGateDesktopUser | null;
  selectedWorkspace: BetterGateDesktopWorkspace | null;
  selectedWorkspaceId: string | null;
  isLoadingWorkspaces: boolean;
  onBack: () => void;
  onComplete: (status?: ToolConnectStatus) => void;
}

function routeGroupKey(routeGroup?: string | null) {
  return routeGroup?.trim() || "standard";
}

function getDefaultRouteGroupKey(routeGroups: BetterGateDesktopRouteGroup[]) {
  return (
    routeGroups.find((group) => group.isDefault)?.key ??
    routeGroups[0]?.key ??
    "standard"
  );
}

function formatRouteGroupPrice(priceMultiplierBps?: number | null) {
  const value = priceMultiplierBps ?? 10_000;

  if (value === 10_000) {
    return "原价";
  }

  const percent = Math.round(Math.abs(value - 10_000) / 100);
  return value < 10_000 ? `-${percent}%` : `+${percent}%`;
}

function defaultModelLabel(value?: string | null) {
  return normalizeBetterGateDefaultModel(value);
}

function getClaudeRoleModelsForDefaultModel(value?: string | null) {
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

const BETTER_GATE_BASE_URL = "https://gateway.better-gate.com";
const BETTER_GATE_OPENAI_BASE_URL = `${BETTER_GATE_BASE_URL}/v1`;
const DEFAULT_CODE_MODEL = "gpt-5.5";
const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-4-6";
const DEFAULT_CLAUDE_OPUS_MODEL = "claude-opus-4-8";
const DEFAULT_CLAUDE_HAIKU_MODEL = "claude-haiku-4-5";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
const DEFAULT_CODEX_REASONING_EFFORT = "high";
const DEFAULT_OPENCODE_NPM = "@ai-sdk/openai-compatible";

function getBetterGateToolBaseUrl(toolId: AppId) {
  switch (toolId) {
    case "codex":
    case "opencode":
    case "openclaw":
    case "hermes":
      return BETTER_GATE_OPENAI_BASE_URL;
    default:
      return BETTER_GATE_BASE_URL;
  }
}

function quoted(value: string) {
  return JSON.stringify(value);
}

function parseDraftBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["true", "1", "yes", "y", "on", "是", "开启"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "off", "否", "关闭"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseJsonRecord(value: string, label: string, strict = true) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    if (!strict) {
      return undefined;
    }

    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    if (!strict) {
      return undefined;
    }

    throw new Error(`${label} 必须是 JSON 对象`);
  }

  return parsed as Record<string, unknown>;
}

function parseJsonArray<T = Record<string, unknown>>(
  value: string,
  label: string,
  strict = true,
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    if (!strict) {
      return undefined;
    }

    throw error;
  }

  if (!Array.isArray(parsed)) {
    if (!strict) {
      return undefined;
    }

    throw new Error(`${label} 必须是 JSON 数组`);
  }

  return parsed as T[];
}

function parseOptionalNonNegativeNumber(
  value: string,
  label: string,
  strict = true,
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const numberValue = Number(trimmed);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    if (!strict) {
      return undefined;
    }

    throw new Error(`${label} 必须是非负数字`);
  }

  return numberValue;
}

function slugValue(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "better-gate"
  );
}

function createProviderKey(toolId: AppId, apiKeyId: string) {
  return slugValue(`better-gate-${toolId}-${apiKeyId}`);
}

function createRawProviderKey(toolId: AppId, apiKeyId: string) {
  return `better-gate-${toolId}-${apiKeyId}`;
}

function getBetterGateProviderKeys(toolId: AppId, apiKeyId: string) {
  return new Set([
    createProviderKey(toolId, apiKeyId),
    createRawProviderKey(toolId, apiKeyId),
  ]);
}

function modelDisplayName(model: string) {
  if (model === DEFAULT_CODE_MODEL) {
    return "GPT-5.5";
  }

  if (model === DEFAULT_GEMINI_MODEL) {
    return "Gemini 2.5 Pro";
  }

  if (model === DEFAULT_CLAUDE_SONNET_MODEL) {
    return "Claude Sonnet 4.6";
  }

  if (model === DEFAULT_CLAUDE_OPUS_MODEL) {
    return "Claude Opus 4.8";
  }

  if (model === DEFAULT_CLAUDE_HAIKU_MODEL) {
    return "Claude Haiku 4.5";
  }

  return model;
}

function normalizeClaudeApiFormat(value: string): ClaudeApiFormat {
  return value === "openai_chat" ||
    value === "openai_responses" ||
    value === "gemini_native"
    ? value
    : "anthropic";
}

function normalizeClaudeApiKeyField(value: string): ClaudeApiKeyField {
  return value === "ANTHROPIC_API_KEY"
    ? "ANTHROPIC_API_KEY"
    : "ANTHROPIC_AUTH_TOKEN";
}

function normalizeCodexProviderId(value: string) {
  return value.trim() || "bettergate";
}

function isValidCodexProviderId(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function extractCodexProviderIdFromSettings(settings: Record<string, unknown>) {
  const config = settings.config;

  if (typeof config !== "string") {
    return null;
  }

  const match = config.match(
    /^\s*model_provider\s*=\s*(["'])([^"'\r\n]+)\1\s*(?:#.*)?$/m,
  );
  const providerId = match?.[2]?.trim();

  if (!providerId || providerId === "openai" || !isValidCodexProviderId(providerId)) {
    return null;
  }

  return providerId;
}

function createOpenCodeModels(primaryModel: string, sonnetModel: string) {
  const models: Record<string, { name: string }> = {};
  models[primaryModel] = { name: primaryModel };

  if (sonnetModel && sonnetModel !== primaryModel) {
    models[sonnetModel] = { name: sonnetModel };
  }

  return models;
}

function createOpenClawModels(primaryModel: string, sonnetModel: string) {
  const models = [{ id: primaryModel, name: primaryModel }];

  if (sonnetModel && sonnetModel !== primaryModel) {
    models.push({ id: sonnetModel, name: sonnetModel });
  }

  return models;
}

function createManualConfigDraft(input: {
  toolId: AppId;
  apiKeyId: string;
  keyName: string;
  secret: string;
  defaultModel?: string | null;
}): ManualConfigDraft {
  const { primaryModel, sonnetModel, opusModel, haikuModel } =
    getClaudeRoleModelsForDefaultModel(input.defaultModel);
  const providerKey = createProviderKey(input.toolId, input.apiKeyId);
  const openModels = createOpenClawModels(primaryModel, sonnetModel);

  return {
    providerKey,
    providerName: input.keyName || "Better Gate",
    baseUrl: getBetterGateToolBaseUrl(input.toolId),
    apiKey: input.secret,
    primaryModel,
    primaryDisplayName: modelDisplayName(primaryModel),
    sonnetModel,
    sonnetDisplayName: modelDisplayName(sonnetModel),
    sonnetSupportsOneM: "false",
    opusModel,
    opusDisplayName: modelDisplayName(opusModel),
    opusSupportsOneM: "false",
    haikuModel,
    haikuDisplayName: modelDisplayName(haikuModel),
    fallbackModel: primaryModel,
    apiFormat: "anthropic",
    apiKeyField: "ANTHROPIC_AUTH_TOKEN",
    claudeDesktopMode: "direct",
    opencodeNpm: DEFAULT_OPENCODE_NPM,
    opencodeModels: JSON.stringify(createOpenCodeModels(primaryModel, sonnetModel), null, 2),
    opencodeExtraOptions: JSON.stringify({ setCacheKey: true }, null, 2),
    apiType: "openai-completions",
    openclawModels: JSON.stringify(openModels, null, 2),
    openclawUserAgent: "false",
    apiMode: "chat_completions",
    hermesModels: JSON.stringify(openModels, null, 2),
    hermesRateLimitDelay: "",
    geminiConfig: "{}",
    codexProviderId: "bettergate",
    codexModelCatalog: JSON.stringify(
      [{ model: primaryModel, displayName: modelDisplayName(primaryModel), contextWindow: "" }],
      null,
      2,
    ),
  };
}

function getManualEditableFields(toolId: AppId): ManualEditableField[] {
  const commonFields: ManualEditableField[] = [
    { key: "providerName", label: "名称" },
    { key: "baseUrl", label: "Base URL" },
    { key: "apiKey", label: "API Key", type: "password" },
  ];
  const claudeFields: ManualEditableField[] = [
    ...commonFields,
    {
      key: "apiFormat",
      label: "API 格式",
      type: "select",
      options: [
        { value: "anthropic", label: "Anthropic Messages" },
        { value: "openai_chat", label: "OpenAI Chat Completions" },
        { value: "openai_responses", label: "OpenAI Responses API" },
        { value: "gemini_native", label: "Gemini Native generateContent" },
      ],
    },
    {
      key: "apiKeyField",
      label: "认证字段",
      type: "select",
      options: [
        { value: "ANTHROPIC_AUTH_TOKEN", label: "ANTHROPIC_AUTH_TOKEN" },
        { value: "ANTHROPIC_API_KEY", label: "ANTHROPIC_API_KEY" },
      ],
    },
    { key: "sonnetDisplayName", label: "Sonnet 显示名" },
    { key: "sonnetModel", label: "Sonnet 请求模型" },
    {
      key: "sonnetSupportsOneM",
      label: "Sonnet 1M",
      type: "select",
      options: [
        { value: "false", label: "否" },
        { value: "true", label: "是" },
      ],
    },
    { key: "opusDisplayName", label: "Opus 显示名" },
    { key: "opusModel", label: "Opus 请求模型" },
    {
      key: "opusSupportsOneM",
      label: "Opus 1M",
      type: "select",
      options: [
        { value: "false", label: "否" },
        { value: "true", label: "是" },
      ],
    },
    { key: "haikuDisplayName", label: "Haiku 显示名" },
    { key: "haikuModel", label: "Haiku 请求模型" },
    { key: "fallbackModel", label: "默认兜底模型" },
  ];

  switch (toolId) {
    case "claude":
      return claudeFields;
    case "claude-desktop":
      return [
        ...commonFields,
        {
          key: "claudeDesktopMode",
          label: "写入模式",
          type: "select",
          options: [
            { value: "direct", label: "Direct" },
            { value: "proxy", label: "Proxy / 模型映射" },
          ],
        },
        ...claudeFields.slice(commonFields.length),
      ];
    case "codex":
      return [
        ...commonFields,
        { key: "codexProviderId", label: "供应商名称" },
        { key: "primaryModel", label: "模型" },
        {
          key: "codexModelCatalog",
          label: "模型目录",
          type: "textarea",
        },
      ];
    case "gemini":
      return [
        ...commonFields,
        { key: "primaryModel", label: "模型" },
        { key: "geminiConfig", label: "扩展配置", type: "textarea" },
      ];
    case "opencode":
      return [
        { key: "providerKey", label: "Provider Key" },
        ...commonFields,
        {
          key: "opencodeNpm",
          label: "NPM 包",
          type: "select",
          options: opencodeNpmPackages.map((item) => ({
            value: item.value,
            label: item.label,
          })),
        },
        { key: "opencodeModels", label: "模型列表", type: "textarea" },
        { key: "opencodeExtraOptions", label: "额外选项", type: "textarea" },
      ];
    case "openclaw":
      return [
        { key: "providerKey", label: "Provider Key" },
        ...commonFields,
        {
          key: "apiType",
          label: "API 协议",
          type: "select",
          options: openclawApiProtocols.map((item) => ({
            value: item.value,
            label: item.label,
          })),
        },
        {
          key: "openclawUserAgent",
          label: "User-Agent",
          type: "select",
          options: [
            { value: "false", label: "不发送" },
            { value: "true", label: "发送" },
          ],
        },
        { key: "openclawModels", label: "模型列表", type: "textarea" },
      ];
    case "hermes":
      return [
        { key: "providerKey", label: "Provider Key" },
        ...commonFields,
        {
          key: "apiMode",
          label: "API 模式",
          type: "select",
          options: hermesApiModes.map((item) => ({
            value: item.value,
            label: item.value,
          })),
        },
        { key: "hermesModels", label: "模型列表", type: "textarea" },
        { key: "hermesRateLimitDelay", label: "请求间隔" },
      ];
    default:
      return claudeFields;
  }
}

export function buildManualConfig(input: {
  toolId: AppId;
  toolTitle: string;
  keyName: string;
  secret: string;
}): {
  fields: ManualConfigField[];
  sections: ManualConfigSection[];
  restartHint: string;
} {
  const baseUrl = getBetterGateToolBaseUrl(input.toolId);
  const providerName = input.keyName || "Better Gate";
  const commonFields: ManualConfigField[] = [
    { label: "名称", value: providerName },
    { label: "Base URL", value: baseUrl },
    { label: "API Key", value: input.secret },
  ];

  if (input.toolId === "codex") {
    return {
      fields: [
        ...commonFields,
        { label: "默认模型", value: DEFAULT_CODE_MODEL },
        { label: "协议", value: "OpenAI Responses API" },
      ],
      sections: [
        {
          title: "~/.codex/config.toml",
          description: "把下面内容合并到 Codex 的 config.toml。",
          content: `model_provider = "bettergate"
model = ${quoted(DEFAULT_CODE_MODEL)}
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.bettergate]
name = ${quoted(providerName)}
base_url = ${quoted(baseUrl)}
wire_api = "responses"
requires_openai_auth = true`,
        },
        {
          title: "~/.codex/auth.json",
          description: "如果 auth.json 已存在，只需要写入 OPENAI_API_KEY。",
          content: JSON.stringify({ OPENAI_API_KEY: input.secret }, null, 2),
        },
      ],
      restartHint: "保存后重启 Codex 终端会话。",
    };
  }

  if (input.toolId === "gemini") {
    return {
      fields: [...commonFields, { label: "模型", value: DEFAULT_GEMINI_MODEL }],
      sections: [
        {
          title: "环境变量",
          description: "填入 Gemini CLI 使用的环境变量。",
          content: `GEMINI_API_KEY=${input.secret}
GOOGLE_GEMINI_BASE_URL=${baseUrl}
GEMINI_MODEL=${DEFAULT_GEMINI_MODEL}`,
        },
      ],
      restartHint: "保存后重启 Gemini CLI。",
    };
  }

  if (input.toolId === "opencode") {
    return {
      fields: [...commonFields, { label: "模型", value: DEFAULT_CODE_MODEL }],
      sections: [
        {
          title: "opencode.json",
          description: "把 provider 片段合并到 OpenCode 配置。",
          content: JSON.stringify(
            {
              provider: {
                bettergate: {
                  npm: "@ai-sdk/openai-compatible",
                  name: providerName,
                  options: {
                    baseURL: baseUrl,
                    apiKey: input.secret,
                  },
                  models: {
                    [DEFAULT_CODE_MODEL]: { name: "GPT-5.5" },
                    [DEFAULT_CLAUDE_SONNET_MODEL]: {
                      name: "Claude Sonnet 4.6",
                    },
                  },
                },
              },
            },
            null,
            2,
          ),
        },
      ],
      restartHint: "保存后重启 OpenCode。",
    };
  }

  if (input.toolId === "openclaw") {
    return {
      fields: [
        ...commonFields,
        { label: "API 类型", value: "openai-completions" },
        { label: "模型", value: DEFAULT_CODE_MODEL },
      ],
      sections: [
        {
          title: "OpenClaw 配置片段",
          description: "把下面内容填入 OpenClaw 的供应商配置。",
          content: JSON.stringify(
            {
              baseUrl: baseUrl,
              apiKey: input.secret,
              api: "openai-completions",
              models: [
                { id: DEFAULT_CODE_MODEL, name: "GPT-5.5" },
                { id: DEFAULT_CLAUDE_SONNET_MODEL, name: "Claude Sonnet 4.6" },
              ],
            },
            null,
            2,
          ),
        },
      ],
      restartHint: "保存后重启 OpenClaw。",
    };
  }

  if (input.toolId === "hermes") {
    return {
      fields: [
        ...commonFields,
        { label: "API 模式", value: "chat_completions" },
        { label: "模型", value: DEFAULT_CODE_MODEL },
      ],
      sections: [
        {
          title: "Hermes 配置片段",
          description: "把下面内容填入 Hermes 的供应商配置。",
          content: JSON.stringify(
            {
              name: providerName,
              base_url: baseUrl,
              api_key: input.secret,
              api_mode: "chat_completions",
              models: [
                { id: DEFAULT_CODE_MODEL, name: "GPT-5.5" },
                { id: DEFAULT_CLAUDE_SONNET_MODEL, name: "Claude Sonnet 4.6" },
              ],
            },
            null,
            2,
          ),
        },
      ],
      restartHint: "保存后重启 Hermes。",
    };
  }

  return {
    fields: [
      ...commonFields,
      { label: "主模型", value: DEFAULT_CLAUDE_SONNET_MODEL },
      { label: "Opus 模型", value: DEFAULT_CLAUDE_OPUS_MODEL },
      { label: "Haiku 模型", value: DEFAULT_CLAUDE_HAIKU_MODEL },
    ],
    sections: [
      {
        title:
          input.toolId === "claude-desktop"
            ? "Claude Desktop 环境变量"
            : "Claude Code 环境变量",
        description: `把下面字段填入 ${input.toolTitle} 的供应商配置。`,
        content: `ANTHROPIC_AUTH_TOKEN=${input.secret}
ANTHROPIC_BASE_URL=${baseUrl}
ANTHROPIC_MODEL=${DEFAULT_CLAUDE_SONNET_MODEL}
ANTHROPIC_DEFAULT_SONNET_MODEL=${DEFAULT_CLAUDE_SONNET_MODEL}
ANTHROPIC_DEFAULT_OPUS_MODEL=${DEFAULT_CLAUDE_OPUS_MODEL}
ANTHROPIC_DEFAULT_HAIKU_MODEL=${DEFAULT_CLAUDE_HAIKU_MODEL}`,
      },
    ],
    restartHint: `保存后重启 ${input.toolTitle}。`,
  };
}

function buildEditableManualConfig(input: {
  toolId: AppId;
  toolTitle: string;
  draft: ManualConfigDraft;
}): {
  fields: ManualConfigField[];
  sections: ManualConfigSection[];
  restartHint: string;
} {
  const providerName = input.draft.providerName.trim() || "Better Gate";
  const baseUrl =
    input.draft.baseUrl.trim() || getBetterGateToolBaseUrl(input.toolId);
  const apiKey = input.draft.apiKey.trim() || "bg_live_...";
  const primaryModel =
    input.draft.primaryModel.trim() ||
    (input.toolId === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_CODE_MODEL);
  const sonnetModel =
    input.draft.sonnetModel.trim() || DEFAULT_CLAUDE_SONNET_MODEL;
  const sonnetDisplayName =
    input.draft.sonnetDisplayName.trim() || modelDisplayName(sonnetModel);
  const sonnetSupportsOneM = parseDraftBoolean(
    input.draft.sonnetSupportsOneM,
    false,
  );
  const opusModel = input.draft.opusModel.trim() || DEFAULT_CLAUDE_OPUS_MODEL;
  const opusDisplayName =
    input.draft.opusDisplayName.trim() || modelDisplayName(opusModel);
  const opusSupportsOneM = parseDraftBoolean(
    input.draft.opusSupportsOneM,
    false,
  );
  const haikuModel =
    input.draft.haikuModel.trim() || DEFAULT_CLAUDE_HAIKU_MODEL;
  const haikuDisplayName =
    input.draft.haikuDisplayName.trim() || modelDisplayName(haikuModel);
  const fallbackModel = input.draft.fallbackModel.trim() || primaryModel;
  const apiFormat = normalizeClaudeApiFormat(input.draft.apiFormat.trim());
  const apiKeyField = normalizeClaudeApiKeyField(
    input.draft.apiKeyField.trim(),
  );
  const claudeDesktopMode =
    input.draft.claudeDesktopMode.trim() === "proxy" ? "proxy" : "direct";
  const opencodeNpm = input.draft.opencodeNpm.trim() || DEFAULT_OPENCODE_NPM;
  const opencodeModels =
    parseJsonRecord(input.draft.opencodeModels, "OpenCode 模型列表", false) ??
    createOpenCodeModels(primaryModel, sonnetModel);
  const opencodeExtraOptions = parseJsonRecord(
    input.draft.opencodeExtraOptions,
    "OpenCode 额外选项",
    false,
  );
  const apiType = input.draft.apiType.trim() || "openai-completions";
  const openclawModels =
    parseJsonArray(input.draft.openclawModels, "OpenClaw 模型列表", false) ??
    createOpenClawModels(primaryModel, sonnetModel);
  const openclawUserAgent = parseDraftBoolean(
    input.draft.openclawUserAgent,
    false,
  );
  const apiMode = input.draft.apiMode.trim() || "chat_completions";
  const hermesModels =
    parseJsonArray(input.draft.hermesModels, "Hermes 模型列表", false) ??
    createOpenClawModels(primaryModel, sonnetModel);
  const hermesRateLimitDelay = parseOptionalNonNegativeNumber(
    input.draft.hermesRateLimitDelay,
    "请求间隔",
    false,
  );
  const geminiConfig =
    parseJsonRecord(input.draft.geminiConfig, "Gemini 扩展配置", false) ?? {};
  const codexProviderId = normalizeCodexProviderId(
    input.draft.codexProviderId,
  );
  const codexModelCatalog =
    parseJsonArray(input.draft.codexModelCatalog, "Codex 模型目录", false) ??
    [];
  const fields = getManualEditableFields(input.toolId).map((field) => ({
    label: field.label,
    value: input.draft[field.key],
  }));

  if (input.toolId === "codex") {
    return {
      fields,
      sections: [
        {
          title: "~/.codex/config.toml",
          description: "将下面内容合并到 Codex 的 config.toml。",
          content: `model_provider = ${quoted(codexProviderId)}
model = ${quoted(primaryModel)}
model_reasoning_effort = ${quoted(DEFAULT_CODEX_REASONING_EFFORT)}
disable_response_storage = true

[model_providers.${codexProviderId}]
name = ${quoted(providerName)}
base_url = ${quoted(baseUrl)}
wire_api = "responses"
requires_openai_auth = true`,
        },
        {
          title: "~/.codex/auth.json",
          description: "如果 auth.json 已存在，只需要写入 OPENAI_API_KEY。",
          content: JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2),
        },
        ...(codexModelCatalog.length > 0
          ? [
              {
                title: "模型目录",
                description: "对应原 Codex 新增供应商里的模型目录字段。",
                content: JSON.stringify(
                  { modelCatalog: { models: codexModelCatalog } },
                  null,
                  2,
                ),
              },
            ]
          : []),
      ],
      restartHint: "保存后重启 Codex，新的供应商配置才会生效。",
    };
  }

  if (input.toolId === "gemini") {
    return {
      fields,
      sections: [
        {
          title: "环境变量",
          description: "填入 Gemini CLI 使用的环境变量。",
          content: `GEMINI_API_KEY=${apiKey}
GOOGLE_GEMINI_BASE_URL=${baseUrl}
GEMINI_MODEL=${primaryModel}`,
        },
        {
          title: "扩展配置",
          description: "对应原 Gemini 新增供应商里的 config JSON。",
          content: JSON.stringify(geminiConfig, null, 2),
        },
      ],
      restartHint: "保存后重启 Gemini CLI，新的供应商配置才会生效。",
    };
  }

  if (input.toolId === "opencode") {
    const options = {
      baseURL: baseUrl,
      apiKey,
      ...(opencodeExtraOptions ?? {}),
    };

    return {
      fields,
      sections: [
        {
          title: "opencode.json",
          description: "将 provider 片段合并到 OpenCode 配置。",
          content: JSON.stringify(
            {
              provider: {
                [input.draft.providerKey.trim() || "better-gate"]: {
                  npm: opencodeNpm,
                  name: providerName,
                  options,
                  models: opencodeModels,
                },
              },
            },
            null,
            2,
          ),
        },
      ],
      restartHint: "保存后重启 OpenCode，新的供应商配置才会生效。",
    };
  }

  if (input.toolId === "openclaw") {
    const openclawConfig = {
      baseUrl,
      apiKey,
      api: apiType,
      models: openclawModels,
      ...(openclawUserAgent
        ? {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BetterGate/1.0",
            },
          }
        : {}),
    };

    return {
      fields,
      sections: [
        {
          title: "OpenClaw 配置片段",
          description: "将下面内容填入 OpenClaw 的供应商配置。",
          content: JSON.stringify(openclawConfig, null, 2),
        },
      ],
      restartHint: "保存后重启 OpenClaw，新的供应商配置才会生效。",
    };
  }

  if (input.toolId === "hermes") {
    const hermesConfig = {
      name: providerName,
      base_url: baseUrl,
      api_key: apiKey,
      api_mode: apiMode,
      models: hermesModels,
      ...(hermesRateLimitDelay !== undefined
        ? { rate_limit_delay: hermesRateLimitDelay }
        : {}),
    };

    return {
      fields,
      sections: [
        {
          title: "Hermes 配置片段",
          description: "将下面内容填入 Hermes 的供应商配置。",
          content: JSON.stringify(hermesConfig, null, 2),
        },
      ],
      restartHint: "保存后重启 Hermes，新的供应商配置才会生效。",
    };
  }

  return {
    fields,
    sections: [
      {
        title:
          input.toolId === "claude-desktop"
            ? "Claude Desktop 环境变量"
            : "Claude Code 环境变量",
        description: `将下面字段填入 ${input.toolTitle} 的供应商配置。`,
        content: `${apiKeyField}=${apiKey}
ANTHROPIC_BASE_URL=${baseUrl}
ANTHROPIC_MODEL=${fallbackModel}
ANTHROPIC_DEFAULT_SONNET_MODEL=${sonnetModel}
ANTHROPIC_DEFAULT_SONNET_MODEL_NAME=${sonnetDisplayName}
ANTHROPIC_DEFAULT_OPUS_MODEL=${opusModel}
ANTHROPIC_DEFAULT_OPUS_MODEL_NAME=${opusDisplayName}
ANTHROPIC_DEFAULT_HAIKU_MODEL=${haikuModel}
ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME=${haikuDisplayName}`,
      },
      ...(input.toolId === "claude-desktop" && claudeDesktopMode === "proxy"
        ? [
            {
              title: "Claude Desktop 模型映射",
              description:
                "对应原 Claude Desktop 新增供应商里的 Proxy / 模型映射字段。",
              content: JSON.stringify(
                {
                  apiFormat,
                  routes: {
                    "claude-sonnet-4-6": {
                      model: sonnetModel,
                      labelOverride: sonnetDisplayName,
                      supports1m: sonnetSupportsOneM,
                    },
                    "claude-opus-4-8": {
                      model: opusModel,
                      labelOverride: opusDisplayName,
                      supports1m: opusSupportsOneM,
                    },
                    "claude-haiku-4-5": {
                      model: haikuModel,
                      labelOverride: haikuDisplayName,
                      supports1m: false,
                    },
                  },
                },
                null,
                2,
              ),
            },
          ]
        : []),
    ],
    restartHint: `保存后重启 ${input.toolTitle}，新的供应商配置才会生效。`,
  };
}

function createBetterGateProviderFromManualDraft(input: {
  toolId: AppId;
  apiKey: BetterGateDesktopApiKey;
  draft: ManualConfigDraft;
}): Provider {
  const providerName = input.draft.providerName.trim() || "Better Gate";
  const baseUrl =
    input.draft.baseUrl.trim() || getBetterGateToolBaseUrl(input.toolId);
  const apiKeySecret = input.draft.apiKey.trim();
  const primaryModel =
    input.draft.primaryModel.trim() ||
    (input.toolId === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_CODE_MODEL);
  const sonnetModel =
    input.draft.sonnetModel.trim() || DEFAULT_CLAUDE_SONNET_MODEL;
  const sonnetDisplayName =
    input.draft.sonnetDisplayName.trim() || modelDisplayName(sonnetModel);
  const sonnetSupportsOneM = parseDraftBoolean(
    input.draft.sonnetSupportsOneM,
    false,
  );
  const opusModel = input.draft.opusModel.trim() || DEFAULT_CLAUDE_OPUS_MODEL;
  const opusDisplayName =
    input.draft.opusDisplayName.trim() || modelDisplayName(opusModel);
  const opusSupportsOneM = parseDraftBoolean(
    input.draft.opusSupportsOneM,
    false,
  );
  const haikuModel =
    input.draft.haikuModel.trim() || DEFAULT_CLAUDE_HAIKU_MODEL;
  const haikuDisplayName =
    input.draft.haikuDisplayName.trim() || modelDisplayName(haikuModel);
  const fallbackModel = input.draft.fallbackModel.trim() || primaryModel;
  const apiFormat = normalizeClaudeApiFormat(input.draft.apiFormat.trim());
  const apiKeyField = normalizeClaudeApiKeyField(
    input.draft.apiKeyField.trim(),
  );
  const claudeDesktopMode =
    input.draft.claudeDesktopMode.trim() === "proxy" ? "proxy" : "direct";
  const opencodeNpm = input.draft.opencodeNpm.trim() || DEFAULT_OPENCODE_NPM;
  const opencodeModels =
    parseJsonRecord(input.draft.opencodeModels, "OpenCode 模型列表") ??
    createOpenCodeModels(primaryModel, sonnetModel);
  const opencodeExtraOptions = parseJsonRecord(
    input.draft.opencodeExtraOptions,
    "OpenCode 额外选项",
  );
  const apiType = input.draft.apiType.trim() || "openai-completions";
  const openclawModels =
    parseJsonArray(input.draft.openclawModels, "OpenClaw 模型列表") ??
    createOpenClawModels(primaryModel, sonnetModel);
  const openclawUserAgent = parseDraftBoolean(
    input.draft.openclawUserAgent,
    false,
  );
  const apiMode = input.draft.apiMode.trim() || "chat_completions";
  const hermesModels =
    parseJsonArray(input.draft.hermesModels, "Hermes 模型列表") ??
    createOpenClawModels(primaryModel, sonnetModel);
  const hermesRateLimitDelay = parseOptionalNonNegativeNumber(
    input.draft.hermesRateLimitDelay,
    "请求间隔",
  );
  const geminiConfig =
    parseJsonRecord(input.draft.geminiConfig, "Gemini 扩展配置") ?? {};
  const codexProviderId = normalizeCodexProviderId(
    input.draft.codexProviderId,
  );
  const codexModelCatalog =
    parseJsonArray(input.draft.codexModelCatalog, "Codex 模型目录") ?? [];
  const provider = createBetterGateProvider({
    toolId: input.toolId,
    apiKey: input.apiKey,
    secret: apiKeySecret,
  });
  const usesProviderKey =
    input.toolId === "opencode" ||
    input.toolId === "openclaw" ||
    input.toolId === "hermes";
  const providerKey = input.draft.providerKey.trim() || provider.id;

  if (
    usesProviderKey &&
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(providerKey)
  ) {
    throw new Error("Provider Key 只能包含小写字母、数字和连字符");
  }

  if (input.toolId === "codex" && !isValidCodexProviderId(codexProviderId)) {
    throw new Error("供应商名称只能包含字母、数字、下划线和连字符");
  }

  const meta = {
    ...(provider.meta ?? {}),
    custom_endpoints: {
      [baseUrl]: {
        url: baseUrl,
        addedAt: Date.now(),
      },
    },
  };

  provider.name = providerName;
  if (usesProviderKey) {
    provider.id = providerKey;
  }
  provider.meta = meta;

  if (input.toolId === "codex") {
    const settingsConfig: Provider["settingsConfig"] = {
      auth: {
        OPENAI_API_KEY: apiKeySecret,
      },
      config: `model_provider = ${quoted(codexProviderId)}
model = ${quoted(primaryModel)}
model_reasoning_effort = ${quoted(DEFAULT_CODEX_REASONING_EFFORT)}
disable_response_storage = true

[model_providers.${codexProviderId}]
name = ${quoted(providerName)}
base_url = ${quoted(baseUrl)}
wire_api = "responses"
requires_openai_auth = true`,
    };
    if (codexModelCatalog.length > 0) {
      settingsConfig.modelCatalog = { models: codexModelCatalog };
    }
    provider.settingsConfig = settingsConfig;
    provider.meta = {
      ...meta,
      apiFormat: "openai_responses",
      isFullUrl: false,
    };
    return provider;
  }

  if (input.toolId === "gemini") {
    provider.settingsConfig = {
      env: {
        GEMINI_API_KEY: apiKeySecret,
        GOOGLE_GEMINI_BASE_URL: baseUrl,
        GEMINI_MODEL: primaryModel,
      },
      config: geminiConfig,
    };
    provider.meta = {
      ...meta,
      apiFormat: "gemini_native",
      isFullUrl: false,
    };
    return provider;
  }

  if (input.toolId === "opencode") {
    provider.settingsConfig = {
      npm: opencodeNpm,
      name: providerName,
      options: {
        baseURL: baseUrl,
        apiKey: apiKeySecret,
        ...(opencodeExtraOptions ?? {}),
      },
      models: opencodeModels,
    };
    provider.meta = {
      ...meta,
      isFullUrl: false,
    };
    return provider;
  }

  if (input.toolId === "openclaw") {
    provider.settingsConfig = {
      baseUrl,
      apiKey: apiKeySecret,
      api: apiType,
      models: openclawModels,
      ...(openclawUserAgent
        ? {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BetterGate/1.0",
            },
          }
        : {}),
    };
    provider.meta = {
      ...meta,
      isFullUrl: false,
    };
    return provider;
  }

  if (input.toolId === "hermes") {
    provider.settingsConfig = {
      name: providerName,
      base_url: baseUrl,
      api_key: apiKeySecret,
      api_mode: apiMode,
      models: hermesModels,
      ...(hermesRateLimitDelay !== undefined
        ? { rate_limit_delay: hermesRateLimitDelay }
        : {}),
    };
    provider.meta = {
      ...meta,
      isFullUrl: false,
    };
    return provider;
  }

  provider.settingsConfig = {
    env: {
      [apiKeyField]: apiKeySecret,
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_MODEL: fallbackModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: sonnetDisplayName,
      ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: opusDisplayName,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: haikuDisplayName,
    },
  };
  provider.meta = {
    ...meta,
    apiFormat,
    apiKeyField,
    claudeDesktopMode:
      input.toolId === "claude-desktop" ? claudeDesktopMode : undefined,
    claudeDesktopModelRoutes:
      input.toolId === "claude-desktop" && claudeDesktopMode === "proxy"
        ? {
            "claude-sonnet-4-6": {
              model: sonnetModel,
              labelOverride: sonnetDisplayName,
              supports1m: sonnetSupportsOneM,
            },
            "claude-opus-4-8": {
              model: opusModel,
              labelOverride: opusDisplayName,
              supports1m: opusSupportsOneM,
            },
            "claude-haiku-4-5": {
              model: haikuModel,
              labelOverride: haikuDisplayName,
              supports1m: false,
            },
          }
        : undefined,
    isFullUrl: false,
  };

  return provider;
}

export function BetterGateToolConnectPage({
  tool,
  user,
  selectedWorkspace,
  selectedWorkspaceId,
  isLoadingWorkspaces,
  onBack,
  onComplete,
}: BetterGateToolConnectPageProps) {
  const [apiKeys, setApiKeys] = useState<BetterGateDesktopApiKey[]>([]);
  const [routeGroups, setRouteGroups] = useState<BetterGateDesktopRouteGroup[]>(
    [],
  );
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [importedApiKeyIds, setImportedApiKeyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isCreatingApiKey, setIsCreatingApiKey] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [isLoadingManualSecret, setIsLoadingManualSecret] = useState(false);
  const [isSavingManualConfig, setIsSavingManualConfig] = useState(false);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualConfigDraft | null>(
    null,
  );
  const [manualErrorMessage, setManualErrorMessage] = useState<string | null>(
    null,
  );
  const [createMode, setCreateMode] = useState<CreateMode>("select");
  const [draftKeyName, setDraftKeyName] = useState(
    getBetterGateDefaultKeyName(tool.id),
  );
  const [draftRouteGroup, setDraftRouteGroup] = useState("standard");
  const manualForm = useForm();

  const selectedApiKey = useMemo(
    () => apiKeys.find((apiKey) => apiKey.id === selectedApiKeyId) ?? null,
    [apiKeys, selectedApiKeyId],
  );
  const canCreateApiKey = Boolean(selectedWorkspace?.canCreateApiKey);
  const toolIcon = APP_ICON_MAP[tool.id].icon;
  const defaultRouteGroup = useMemo(
    () => getDefaultRouteGroupKey(routeGroups),
    [routeGroups],
  );
  const routeGroupLabels = useMemo(
    () => new Map(routeGroups.map((group) => [group.key, group.name])),
    [routeGroups],
  );
  const manualConfig = useMemo(() => {
    if (!manualSecret || !manualDraft) {
      return null;
    }

    return buildEditableManualConfig({
      toolId: tool.id,
      toolTitle: tool.title,
      draft: manualDraft,
    });
  }, [manualDraft, manualSecret, tool.id, tool.title]);

  const syncImportedApiKeys = useCallback(
    async (keys: BetterGateDesktopApiKey[]) => {
      try {
        const currentProviderId = await providersApi.getCurrent(tool.id);
        const importedIds = new Set<string>();

        for (const apiKey of keys) {
          const expectedProviderIds = getBetterGateProviderKeys(tool.id, apiKey.id);
          if (expectedProviderIds.has(currentProviderId)) {
            importedIds.add(apiKey.id);
            break;
          }
        }

        setImportedApiKeyIds(importedIds);
      } catch (error) {
        console.error(
          "[BetterGateToolConnectPage] failed to sync imported api keys",
          error,
        );
      }
    },
    [tool.id],
  );

  const loadApiKeys = useCallback(async (workspaceId: string) => {
    setIsLoadingApiKeys(true);
    setErrorMessage(null);

    try {
      const result = await listBetterGateDesktopApiKeys(workspaceId);
      const nextRouteGroups = result.routeGroups ?? [];
      const routeGroupDefaults = new Map(
        nextRouteGroups.map((group) => [
          routeGroupKey(group.key),
          normalizeBetterGateDefaultModel(group.defaultModel ?? group.modelFamily),
        ]),
      );
      const nextApiKeys = sortBetterGateApiKeys(
        result.apiKeys.map((apiKey) => {
          const fallbackDefaultModel = routeGroupDefaults.get(
            routeGroupKey(apiKey.routeGroup),
          );
          const routeGroupDefaultModel = normalizeBetterGateDefaultModel(
            apiKey.routeGroupDefaultModel ??
              apiKey.routeGroupModelFamily ??
              fallbackDefaultModel,
          );

          return {
            ...apiKey,
            routeGroupDefaultModel,
            routeGroupModelFamily:
              apiKey.routeGroupModelFamily ??
              normalizeBetterGateModelFamily(routeGroupDefaultModel),
          };
        }),
      );

      setApiKeys(nextApiKeys);
      setRouteGroups(nextRouteGroups);
      setSelectedApiKeyId((current) => {
        if (nextApiKeys.some((apiKey) => apiKey.id === current)) {
          return current;
        }

        return (
          nextApiKeys.find((apiKey) =>
            isBetterGateApiKeyDirectlyImportable(apiKey),
          )?.id ??
          nextApiKeys[0]?.id ??
          null
        );
      });
      setDraftRouteGroup((current) => {
        if (nextRouteGroups.some((group) => group.key === current)) {
          return current;
        }

        return getDefaultRouteGroupKey(nextRouteGroups);
      });
      void syncImportedApiKeys(nextApiKeys);
    } catch (error) {
      console.error(
        "[BetterGateToolConnectPage] failed to load api keys",
        error,
      );
      setErrorMessage("无法读取 API Key，请稍后重试。");
    } finally {
      setIsLoadingApiKeys(false);
    }
  }, [syncImportedApiKeys]);

  useEffect(() => {
    setDraftKeyName(getBetterGateDefaultKeyName(tool.id));
  }, [tool.id]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setApiKeys([]);
      setRouteGroups([]);
      setSelectedApiKeyId(null);
      return;
    }

    void loadApiKeys(selectedWorkspaceId);
  }, [loadApiKeys, selectedWorkspaceId]);

  const openCreateDialog = (mode: CreateMode) => {
    setCreateMode(mode);
    setDraftKeyName(getBetterGateDefaultKeyName(tool.id));
    setDraftRouteGroup(defaultRouteGroup);
    setErrorMessage(null);
    setIsCreateDialogOpen(true);
  };

  const importSecret = async (
    secret: string,
    apiKey: BetterGateDesktopApiKey,
  ) => {
    const provider = createBetterGateProvider({
      toolId: tool.id,
      apiKey,
      secret,
    });

    await providersApi.add(provider, tool.id, true);
    await providersApi.switch(provider.id, tool.id);
    setImportedApiKeyIds(new Set([apiKey.id]));
    setSelectedApiKeyId(apiKey.id);
    toast.success(`已接入 ${tool.title}`, { closeButton: true });
    onComplete({ configured: true, name: apiKey.name || "Better Gate Key" });
  };

  const createApiKey = async (mode: CreateMode) => {
    if (!selectedWorkspace) {
      setErrorMessage("请先选择工作区。");
      return;
    }

    if (!selectedWorkspace.canCreateApiKey) {
      setErrorMessage("当前工作区无法创建 API Key，请联系管理员。");
      return;
    }

    const name = draftKeyName.trim();
    if (!name) {
      setErrorMessage("请输入 API Key 名称。");
      return;
    }

    setIsCreatingApiKey(true);
    setErrorMessage(null);

    try {
      const result = await createBetterGateDesktopApiKey({
        workspaceId: selectedWorkspace.id,
        name,
        tool: tool.title,
        routeGroup: draftRouteGroup || defaultRouteGroup,
      });
      const createdRouteGroup = routeGroups.find(
        (group) => group.key === (result.apiKey.routeGroup || draftRouteGroup),
      );
      const createdApiKey = {
        ...result.apiKey,
        routeGroupDefaultModel: normalizeBetterGateDefaultModel(
          result.apiKey.routeGroupDefaultModel ??
            result.apiKey.routeGroupModelFamily ??
            createdRouteGroup?.defaultModel ??
            createdRouteGroup?.modelFamily,
        ),
        routeGroupModelFamily:
          result.apiKey.routeGroupModelFamily ??
          normalizeBetterGateModelFamily(
            result.apiKey.routeGroupDefaultModel ??
              createdRouteGroup?.defaultModel ??
              createdRouteGroup?.modelFamily,
          ),
      };
      const nextApiKeys = sortBetterGateApiKeys([...apiKeys, createdApiKey]);

      setApiKeys(nextApiKeys);
      setSelectedApiKeyId(createdApiKey.id);
      setIsCreateDialogOpen(false);
      toast.success("已创建 API Key", { closeButton: true });

      if (mode === "import") {
        await importSecret(result.secret, createdApiKey);
      }
    } catch (error) {
      console.error(
        "[BetterGateToolConnectPage] failed to create api key",
        error,
      );
      setErrorMessage("创建 API Key 失败，请检查权限后重试。");
    } finally {
      setIsCreatingApiKey(false);
    }
  };

  const handleImport = async () => {
    if (!selectedWorkspace) {
      setErrorMessage("请先选择工作区。");
      return;
    }

    if (
      !selectedApiKey ||
      !isBetterGateApiKeyDirectlyImportable(selectedApiKey)
    ) {
      openCreateDialog("import");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const result = await revealBetterGateDesktopApiKey({
        workspaceId: selectedWorkspace.id,
        apiKeyId: selectedApiKey.id,
      });

      if (!result.secret) {
        openCreateDialog("import");
        return;
      }

      await importSecret(result.secret, selectedApiKey);
    } catch (error) {
      console.error(
        "[BetterGateToolConnectPage] failed to reveal api key",
        error,
      );
      setErrorMessage("读取 API Key 失败，请确认你有权限使用这个 Key。");
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenManualConfig = async () => {
    if (!selectedWorkspace) {
      setErrorMessage("请先选择工作区。");
      return;
    }

    if (!selectedApiKey) {
      if (canCreateApiKey) {
        openCreateDialog("select");
      } else {
        setErrorMessage("请先选择一个可用的 API Key。");
      }
      return;
    }

    if (!isBetterGateApiKeyDirectlyImportable(selectedApiKey)) {
      setErrorMessage(
        "这个 Key 暂时没有保存完整密钥，请创建新的 Key 后再自定义配置。",
      );
      return;
    }

    setIsManualDialogOpen(true);
    setIsLoadingManualSecret(true);
    setManualSecret(null);
    setManualDraft(null);
    setManualErrorMessage(null);

    try {
      const result = await revealBetterGateDesktopApiKey({
        workspaceId: selectedWorkspace.id,
        apiKeyId: selectedApiKey.id,
      });

      if (!result.secret) {
        setManualErrorMessage(
          "无法读取完整 API Key，请创建新的 Key 后再自定义配置。",
        );
        return;
      }

      let draft = createManualConfigDraft({
          toolId: tool.id,
          apiKeyId: selectedApiKey.id,
          keyName: selectedApiKey.name,
          secret: result.secret,
          defaultModel:
            selectedApiKey.routeGroupDefaultModel ??
            selectedApiKey.routeGroupModelFamily,
        });

      if (tool.id === "codex") {
        try {
          const liveSettings = await providersApi.readLiveSettings("codex");
          const existingProviderId =
            extractCodexProviderIdFromSettings(liveSettings);

          if (existingProviderId) {
            draft = {
              ...draft,
              codexProviderId: existingProviderId,
            };
          }
        } catch (error) {
          console.warn(
            "[BetterGateToolConnectPage] failed to read Codex provider id",
            error,
          );
        }
      }

      setManualSecret(result.secret);
      setManualDraft(draft);
    } catch (error) {
      console.error(
        "[BetterGateToolConnectPage] failed to reveal manual api key",
        error,
      );
      setManualErrorMessage("读取 API Key 失败，请稍后重试。");
    } finally {
      setIsLoadingManualSecret(false);
    }
  };

  const updateManualDraft = (key: keyof ManualConfigDraft, value: string) => {
    setManualDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
  };

  const parseManualRecord = <T extends Record<string, unknown>>(
    key: keyof ManualConfigDraft,
    fallback: T,
  ): T => {
    if (!manualDraft) {
      return fallback;
    }

    return (
      (parseJsonRecord(manualDraft[key], String(key), false) as T | undefined) ??
      fallback
    );
  };

  const parseManualArray = <T,>(
    key: keyof ManualConfigDraft,
    fallback: T[],
  ): T[] => {
    if (!manualDraft) {
      return fallback;
    }

    return (
      (parseJsonArray<T>(manualDraft[key], String(key), false) as
        | T[]
        | undefined) ?? fallback
    );
  };

  const handleClaudeModelChange = (
    field: ClaudeModelEnvField,
    value: string,
  ) => {
    const fieldMap: Partial<Record<ClaudeModelEnvField, keyof ManualConfigDraft>> =
      {
        ANTHROPIC_MODEL: "fallbackModel",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnetModel",
        ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: "sonnetDisplayName",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "opusModel",
        ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: "opusDisplayName",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "haikuModel",
        ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: "haikuDisplayName",
      };
    const draftKey = fieldMap[field];

    if (draftKey) {
      updateManualDraft(draftKey, value);
    }
  };

  const renderManualBasics = (includeProviderKey = false) => {
    if (!manualDraft) {
      return null;
    }

    return (
      <div className="space-y-4">
        {includeProviderKey ? (
          <div className="space-y-2">
            <Label htmlFor="manual-provider-key">Provider Key</Label>
            <Input
              id="manual-provider-key"
              value={manualDraft.providerKey}
              onChange={(event) =>
                updateManualDraft("providerKey", slugValue(event.target.value))
              }
              placeholder="better-gate"
            />
            <p className="text-xs leading-5 text-neutral-400">
              OpenCode、OpenClaw、Hermes 会把它作为本地配置里的供应商主键。
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="manual-provider-name">名称</Label>
          <Input
            id="manual-provider-name"
            value={manualDraft.providerName}
            onChange={(event) =>
              updateManualDraft("providerName", event.target.value)
            }
          />
        </div>
      </div>
    );
  };

  const renderClaudeDesktopManualFields = () => {
    if (!manualDraft) {
      return null;
    }

    const mode =
      manualDraft.claudeDesktopMode === "proxy" ? "proxy" : "direct";
    const roles = [
      {
        label: "Sonnet",
        modelKey: "sonnetModel",
        nameKey: "sonnetDisplayName",
        oneMKey: "sonnetSupportsOneM",
      },
      {
        label: "Opus",
        modelKey: "opusModel",
        nameKey: "opusDisplayName",
        oneMKey: "opusSupportsOneM",
      },
      {
        label: "Haiku",
        modelKey: "haikuModel",
        nameKey: "haikuDisplayName",
        oneMKey: null,
      },
    ] as const;

    return (
      <div className="space-y-5">
        {renderManualBasics(false)}
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            value={manualDraft.apiKey}
            onChange={(event) => updateManualDraft("apiKey", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>API 端点</Label>
          <Input
            value={manualDraft.baseUrl}
            onChange={(event) =>
              updateManualDraft("baseUrl", event.target.value)
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="space-y-1">
            <Label>需要模型映射</Label>
            <p className="text-xs leading-5 text-neutral-400">
              原 Claude Desktop 新增供应商里的 Direct / Proxy 模式。
            </p>
          </div>
          <Switch
            checked={mode === "proxy"}
            onCheckedChange={(checked) =>
              updateManualDraft("claudeDesktopMode", checked ? "proxy" : "direct")
            }
          />
        </div>

        {mode === "proxy" ? (
          <div className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="space-y-2">
              <Label>API 格式</Label>
              <Select
                value={normalizeClaudeApiFormat(manualDraft.apiFormat)}
                onValueChange={(value) =>
                  updateManualDraft("apiFormat", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic Messages</SelectItem>
                  <SelectItem value="openai_chat">
                    OpenAI Chat Completions
                  </SelectItem>
                  <SelectItem value="openai_responses">
                    OpenAI Responses API
                  </SelectItem>
                  <SelectItem value="gemini_native">
                    Gemini Native generateContent
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>模型映射</Label>
              {roles.map((role) => (
                <div
                  key={role.label}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[92px_1fr_1fr_72px]"
                >
                  <div className="flex h-9 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                    {role.label}
                  </div>
                  <Input
                    value={manualDraft[role.nameKey]}
                    onChange={(event) =>
                      updateManualDraft(role.nameKey, event.target.value)
                    }
                    placeholder="显示名称"
                  />
                  <Input
                    value={manualDraft[role.modelKey]}
                    onChange={(event) =>
                      updateManualDraft(role.modelKey, event.target.value)
                    }
                    placeholder="实际请求模型"
                  />
                  {role.oneMKey ? (
                    <label className="flex h-9 items-center gap-2 text-sm text-neutral-500">
                      <Checkbox
                        checked={parseDraftBoolean(
                          manualDraft[role.oneMKey],
                          false,
                        )}
                        onCheckedChange={(checked) =>
                          updateManualDraft(
                            role.oneMKey,
                            checked === true ? "true" : "false",
                          )
                        }
                      />
                      1M
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderManualFormFields = () => {
    if (!manualDraft) {
      return null;
    }

    if (tool.id === "claude") {
      return (
        <div className="space-y-5">
          {renderManualBasics(false)}
          <ClaudeFormFields
            providerId={manualDraft.providerKey}
            shouldShowApiKey
            apiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            templateValueEntries={[]}
            templateValues={{}}
            templatePresetName=""
            onTemplateValueChange={() => undefined}
            shouldShowSpeedTest
            baseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            isEndpointModalOpen={false}
            onEndpointModalToggle={() => undefined}
            autoSelect={false}
            onAutoSelectChange={() => undefined}
            showEndpointTools={false}
            shouldShowModelSelector
            shouldShowModelActions={false}
            claudeModel={manualDraft.fallbackModel}
            defaultHaikuModel={manualDraft.haikuModel}
            defaultHaikuModelName={manualDraft.haikuDisplayName}
            defaultSonnetModel={manualDraft.sonnetModel}
            defaultSonnetModelName={manualDraft.sonnetDisplayName}
            defaultOpusModel={manualDraft.opusModel}
            defaultOpusModelName={manualDraft.opusDisplayName}
            onModelChange={handleClaudeModelChange}
            speedTestEndpoints={[]}
            apiFormat={normalizeClaudeApiFormat(manualDraft.apiFormat)}
            onApiFormatChange={(value) => updateManualDraft("apiFormat", value)}
            apiKeyField={normalizeClaudeApiKeyField(manualDraft.apiKeyField)}
            onApiKeyFieldChange={(value) =>
              updateManualDraft("apiKeyField", value)
            }
            isFullUrl={false}
            onFullUrlChange={() => undefined}
          />
        </div>
      );
    }

    if (tool.id === "claude-desktop") {
      return renderClaudeDesktopManualFields();
    }

    if (tool.id === "codex") {
      const apiFormat: CodexApiFormat =
        manualDraft.apiFormat === "openai_chat"
          ? "openai_chat"
          : "openai_responses";
      const catalogModels = parseManualArray<CodexCatalogModel>(
        "codexModelCatalog",
        [],
      );
      const reasoning: CodexChatReasoning = {};

      return (
        <div className="space-y-5">
          {renderManualBasics(false)}
          <div className="space-y-2">
            <Label htmlFor="manual-codex-provider-id">供应商名称</Label>
            <Input
              id="manual-codex-provider-id"
              value={manualDraft.codexProviderId}
              onChange={(event) =>
                updateManualDraft(
                  "codexProviderId",
                  event.target.value.trim(),
                )
              }
              placeholder="bettergate"
            />
            <p className="text-xs leading-5 text-neutral-400">
              Codex 会按供应商名称区分会话记录。如果你从其他接入方式迁移，可以填回原来的名称，例如 custom；新用户保持默认即可。
            </p>
          </div>
          <CodexFormFields
            providerId={manualDraft.providerKey}
            codexApiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            shouldShowSpeedTest
            codexBaseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            isFullUrl={false}
            onFullUrlChange={() => undefined}
            isEndpointModalOpen={false}
            onEndpointModalToggle={() => undefined}
            autoSelect={false}
            onAutoSelectChange={() => undefined}
            apiFormat={apiFormat}
            onApiFormatChange={(value) => updateManualDraft("apiFormat", value)}
            codexChatReasoning={reasoning}
            catalogModels={catalogModels}
            onCatalogModelsChange={(models) =>
              updateManualDraft(
                "codexModelCatalog",
                JSON.stringify(models, null, 2),
              )
            }
            shouldShowModelFetch={false}
            speedTestEndpoints={[]}
          />
        </div>
      );
    }

    if (tool.id === "gemini") {
      return (
        <div className="space-y-5">
          {renderManualBasics(false)}
          <GeminiFormFields
            providerId={manualDraft.providerKey}
            shouldShowApiKey
            apiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            shouldShowSpeedTest
            baseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            isEndpointModalOpen={false}
            onEndpointModalToggle={() => undefined}
            onCustomEndpointsChange={() => undefined}
            autoSelect={false}
            onAutoSelectChange={() => undefined}
            shouldShowModelField
            shouldShowModelFetch={false}
            model={manualDraft.primaryModel}
            onModelChange={(value) => updateManualDraft("primaryModel", value)}
            speedTestEndpoints={[]}
          />
        </div>
      );
    }

    if (tool.id === "opencode") {
      const models = parseManualRecord<Record<string, OpenCodeModel>>(
        "opencodeModels",
        {},
      );
      const extraOptions = parseManualRecord<Record<string, string>>(
        "opencodeExtraOptions",
        {},
      );

      return (
        <div className="space-y-5">
          {renderManualBasics(true)}
          <OpenCodeFormFields
            npm={manualDraft.opencodeNpm}
            onNpmChange={(value) => updateManualDraft("opencodeNpm", value)}
            apiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            baseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            models={models}
            onModelsChange={(nextModels) =>
              updateManualDraft(
                "opencodeModels",
                JSON.stringify(nextModels, null, 2),
              )
            }
            shouldShowModelFetch={false}
            extraOptions={extraOptions}
            onExtraOptionsChange={(nextOptions) =>
              updateManualDraft(
                "opencodeExtraOptions",
                JSON.stringify(nextOptions, null, 2),
              )
            }
          />
        </div>
      );
    }

    if (tool.id === "openclaw") {
      const models = parseManualArray<OpenClawModel>("openclawModels", []);

      return (
        <div className="space-y-5">
          {renderManualBasics(true)}
          <OpenClawFormFields
            baseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            apiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            api={manualDraft.apiType}
            onApiChange={(value) => updateManualDraft("apiType", value)}
            models={models}
            onModelsChange={(nextModels) =>
              updateManualDraft(
                "openclawModels",
                JSON.stringify(nextModels, null, 2),
              )
            }
            shouldShowModelFetch={false}
            userAgent={parseDraftBoolean(manualDraft.openclawUserAgent, false)}
            onUserAgentChange={(checked) =>
              updateManualDraft("openclawUserAgent", checked ? "true" : "false")
            }
          />
        </div>
      );
    }

    if (tool.id === "hermes") {
      const models = parseManualArray<HermesModel>("hermesModels", []);
      const rateLimitDelay = parseOptionalNonNegativeNumber(
        manualDraft.hermesRateLimitDelay,
        "请求间隔",
        false,
      );

      return (
        <div className="space-y-5">
          {renderManualBasics(true)}
          <HermesFormFields
            baseUrl={manualDraft.baseUrl}
            onBaseUrlChange={(value) => updateManualDraft("baseUrl", value)}
            apiKey={manualDraft.apiKey}
            onApiKeyChange={(value) => updateManualDraft("apiKey", value)}
            category="aggregator"
            shouldShowApiKeyLink={false}
            websiteUrl=""
            apiMode={manualDraft.apiMode as HermesApiMode}
            onApiModeChange={(value) => updateManualDraft("apiMode", value)}
            models={models}
            onModelsChange={(nextModels) =>
              updateManualDraft(
                "hermesModels",
                JSON.stringify(nextModels, null, 2),
              )
            }
            shouldShowModelFetch={false}
            rateLimitDelay={rateLimitDelay}
            onRateLimitDelayChange={(value) =>
              updateManualDraft(
                "hermesRateLimitDelay",
                value === undefined ? "" : String(value),
              )
            }
          />
        </div>
      );
    }

    return null;
  };

  const handleSaveManualConfig = async () => {
    if (!selectedApiKey || !manualDraft) {
      return;
    }

    setIsSavingManualConfig(true);
    setManualErrorMessage(null);

    try {
      const provider = createBetterGateProviderFromManualDraft({
        toolId: tool.id,
        apiKey: selectedApiKey,
        draft: manualDraft,
      });

      await providersApi.add(provider, tool.id, true);
      await providersApi.switch(provider.id, tool.id);
      setImportedApiKeyIds(new Set([selectedApiKey.id]));
      setSelectedApiKeyId(selectedApiKey.id);
      toast.success(`已应用到 ${tool.title}`, { closeButton: true });
      setIsManualDialogOpen(false);
      onComplete({
        configured: true,
        name: provider.name || selectedApiKey.name || "Better Gate Key",
      });
    } catch (error) {
      console.error(
        "[BetterGateToolConnectPage] failed to save manual config",
        error,
      );
      setManualErrorMessage(
        error instanceof Error
          ? error.message
          : "保存配置失败，请检查字段后重试。",
      );
    } finally {
      setIsSavingManualConfig(false);
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      await copyText(text);
      toast.success("已复制", { closeButton: true });
    } catch (error) {
      console.error("[BetterGateToolConnectPage] failed to copy text", error);
      toast.error("复制失败，请手动选择复制。", { closeButton: true });
    }
  };

  const primaryLabel = !selectedApiKey
    ? "创建并接入"
    : isBetterGateApiKeyDirectlyImportable(selectedApiKey)
      ? importedApiKeyIds.has(selectedApiKey.id)
        ? `重新接入到 ${tool.title}`
        : `接入到 ${tool.title}`
      : "创建新 Key 并接入";

  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-4">
      <div className="flex h-10 items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center rounded-lg px-2 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </button>

        <button
          type="button"
          onClick={() =>
            selectedWorkspaceId && void loadApiKeys(selectedWorkspaceId)
          }
          disabled={isBusy || isCreatingApiKey || !selectedWorkspaceId}
          className="flex h-8 items-center rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
        >
          <RefreshCw
            className={cn(
              "mr-1.5 h-3.5 w-3.5",
              isLoadingApiKeys && "animate-spin",
            )}
          />
          刷新
        </button>
      </div>

      <div className="mt-3 flex h-[60px] items-center gap-3 rounded-xl px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
          {toolIcon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-neutral-950 dark:text-neutral-50">
            {tool.title}
          </h1>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {selectedWorkspace
              ? getBetterGateWorkspaceTitle(selectedWorkspace, user)
              : "选择工作区"}
          </p>
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-3">
          <p className="text-xs font-medium text-neutral-400">API Key</p>
          <button
            type="button"
            onClick={() => openCreateDialog("select")}
            disabled={
              isBusy ||
              isCreatingApiKey ||
              isLoadingWorkspaces ||
              isLoadingApiKeys ||
              !canCreateApiKey
            }
            className="flex h-7 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
          >
            {isCreatingApiKey ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            创建新 Key
          </button>
        </div>
        <div className="space-y-1">
          {isLoadingApiKeys ? (
            <div className="flex h-[64px] items-center justify-center rounded-xl">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          ) : apiKeys.length ? (
            apiKeys.map((apiKey) => {
              const selected = selectedApiKeyId === apiKey.id;
              const directImportable =
                isBetterGateApiKeyDirectlyImportable(apiKey);
              const imported = importedApiKeyIds.has(apiKey.id);
              const showCheck = imported || (!importedApiKeyIds.size && selected);
              const apiKeyRouteGroup = routeGroupKey(apiKey.routeGroup);
              const routeGroupLabel =
                routeGroupLabels.get(apiKeyRouteGroup) ?? apiKeyRouteGroup;
              const apiKeyDefaultModelLabel = defaultModelLabel(
                apiKey.routeGroupDefaultModel ?? apiKey.routeGroupModelFamily,
              );

              return (
                <button
                  key={apiKey.id}
                  type="button"
                  onClick={() => setSelectedApiKeyId(apiKey.id)}
                  className={cn(
                    "flex h-[60px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                    selected
                      ? "bg-neutral-50 dark:bg-neutral-800/70"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                      {apiKey.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-400">
                      {apiKey.keyPrefix} · {routeGroupLabel} ·{" "}
                      {apiKeyDefaultModelLabel}
                    </span>
                  </span>
                  {imported || !directImportable ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        imported
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : apiKey.status === "ACTIVE"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
                      )}
                    >
                      {imported ? "已导入" : getBetterGateApiKeyStatus(apiKey)}
                    </span>
                  ) : null}
                  {showCheck ? (
                    <Check className="h-4 w-4 shrink-0 text-neutral-950 dark:text-neutral-50" />
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl px-6 text-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <KeyRound className="h-4 w-4" />
              </span>
              <span className="mt-3 min-w-0">
                <span className="block text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                  {selectedWorkspace ? "新建 API Key" : "请选择工作区"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-400">
                  {selectedWorkspace
                    ? "当前工作区暂无可导入 Key"
                    : "选择工作区后继续"}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {selectedApiKey &&
      !isBetterGateApiKeyDirectlyImportable(selectedApiKey) ? (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          这个 Key 暂时没有保存完整密钥。继续时会创建一个新的 Key。
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:bg-red-500/10 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="truncate text-xs text-neutral-400">
          接入完成后，请重启 {tool.title}。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleOpenManualConfig()}
            className="h-10 rounded-xl px-4"
            disabled={
              isBusy ||
              isCreatingApiKey ||
              isLoadingWorkspaces ||
              isLoadingApiKeys ||
              !selectedWorkspace
            }
          >
            <FileText className="mr-2 h-4 w-4" />
            自定义配置
          </Button>
          <Button
            onClick={() => void handleImport()}
            className="h-10 rounded-xl bg-neutral-950 px-5 text-white hover:bg-neutral-800 disabled:bg-neutral-300 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
            disabled={
              isBusy ||
              isCreatingApiKey ||
              isLoadingWorkspaces ||
              isLoadingApiKeys ||
              !selectedWorkspace ||
              (!selectedApiKey && !canCreateApiKey) ||
              (Boolean(selectedApiKey) &&
                !isBetterGateApiKeyDirectlyImportable(selectedApiKey) &&
                !canCreateApiKey)
            }
          >
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </Button>
        </div>
      </div>

      <Dialog
        open={isManualDialogOpen}
        onOpenChange={(open) => {
          if (isSavingManualConfig) {
            return;
          }

          setIsManualDialogOpen(open);
          if (!open) {
            setManualSecret(null);
            setManualDraft(null);
            setManualErrorMessage(null);
          }
        }}
      >
        <DialogContent className="max-w-[560px] rounded-2xl border-neutral-200 bg-white p-0 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <DialogHeader className="border-b-0 bg-transparent px-5 pb-2 pt-5">
            <DialogTitle className="text-base">自定义配置</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              复制下面字段或配置片段，粘贴到 {tool.title} 的配置中。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[520px] space-y-4 overflow-y-auto px-5 pb-5 pt-2">
            {isLoadingManualSecret ? (
              <div className="flex h-28 items-center justify-center rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : manualErrorMessage ? (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                {manualErrorMessage}
              </div>
            ) : manualConfig ? (
              <>
                <div className="space-y-3">
                  <p className="text-xs font-medium text-neutral-400">
                    配置表单
                  </p>
                  <Form {...manualForm}>
                    <div className="bettergate-manual-form rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/30">
                      {renderManualFormFields()}
                    </div>
                  </Form>
                </div>

                <div className="space-y-3">
                  {manualConfig.sections.map((section) => (
                    <section key={section.title} className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">
                            {section.title}
                          </p>
                          {section.description ? (
                            <p className="mt-0.5 text-xs leading-5 text-neutral-400">
                              {section.description}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyText(section.content)}
                          className="flex h-7 shrink-0 items-center rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                        >
                          <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                          复制
                        </button>
                      </div>
                      <pre className="max-h-44 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                        <code>{section.content}</code>
                      </pre>
                    </section>
                  ))}
                </div>

                <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
                  {manualConfig.restartHint}
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter className="border-t border-neutral-100 bg-transparent px-5 py-4 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsManualDialogOpen(false)}
              className="h-9 rounded-xl"
              disabled={isSavingManualConfig}
            >
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveManualConfig()}
              className="h-9 rounded-xl bg-neutral-950 px-4 text-white hover:bg-neutral-800 disabled:bg-neutral-300 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
              disabled={
                isSavingManualConfig ||
                isLoadingManualSecret ||
                !manualDraft ||
                !manualConfig ||
                !selectedApiKey
              }
            >
              {isSavingManualConfig ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              保存并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-[420px] rounded-2xl border-neutral-200 bg-white p-0 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <DialogHeader className="border-b-0 bg-transparent px-5 pb-2 pt-5">
            <DialogTitle className="text-base">创建 API Key</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              设置名称和渠道分组。创建后会保存在当前工作区。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="bettergate-key-name" className="text-xs">
                名称
              </Label>
              <Input
                id="bettergate-key-name"
                value={draftKeyName}
                onChange={(event) => setDraftKeyName(event.target.value)}
                maxLength={80}
                placeholder="生产 Key"
                className="h-10 rounded-xl shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bettergate-route-group" className="text-xs">
                渠道分组
              </Label>
              <Select
                value={draftRouteGroup}
                onValueChange={setDraftRouteGroup}
                disabled={!routeGroups.length}
              >
                <SelectTrigger
                  id="bettergate-route-group"
                  className="h-10 rounded-xl shadow-none"
                >
                  <SelectValue placeholder="选择渠道分组" />
                </SelectTrigger>
                <SelectContent>
                  {routeGroups.length ? (
                    routeGroups.map((group) => {
                      const priceLabel = formatRouteGroupPrice(
                        group.priceMultiplierBps,
                      );
                      const isDiscount =
                        (group.priceMultiplierBps ?? 10_000) < 10_000;
                      const defaultModel = defaultModelLabel(
                        group.defaultModel ?? group.modelFamily,
                      );

                      return (
                        <SelectItem key={group.key} value={group.key}>
                          <span className="flex w-full min-w-0 items-center justify-between gap-3">
                            <span className="min-w-0 truncate">
                              {group.name} ({group.key})
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                                {defaultModel}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  isDiscount
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
                                )}
                              >
                                {priceLabel}
                              </span>
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem value="standard">默认 (standard)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {errorMessage ? (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-neutral-100 bg-transparent px-5 py-4 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isCreatingApiKey}
              className="h-9 rounded-xl"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void createApiKey(createMode)}
              disabled={isCreatingApiKey || !draftKeyName.trim()}
              className="h-9 rounded-xl bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {isCreatingApiKey ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {createMode === "import" ? "创建并接入" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
