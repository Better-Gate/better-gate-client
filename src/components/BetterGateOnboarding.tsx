import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ArrowLeft, Check, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { APP_ICON_MAP } from "@/config/appConfig";
import { Button } from "@/components/ui/button";
import { WindowControlIcon } from "@/components/WindowControlIcon";
import { providersApi } from "@/lib/api/providers";
import type { AppId } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  createBetterGateDesktopApiKey,
  getBetterGateDesktopMe,
  getBetterGateSaasUrl,
  listBetterGateDesktopApiKeys,
  listBetterGateDesktopWorkspaces,
  revealBetterGateDesktopApiKey,
  type BetterGateDesktopApiKey,
  type BetterGateDesktopUser,
  type BetterGateDesktopWorkspace,
} from "@/lib/api/betterGateDesktop";
import {
  getBetterGateApiKeyDefaultModel,
  normalizeBetterGateDefaultModel,
  normalizeBetterGateModelFamily,
} from "@/lib/betterGateConnect";
import type { Provider } from "@/types";

const ONBOARDING_DONE_KEY = "better-gate:desktop-onboarding-done";
const ONBOARDING_STATE_KEY = "better-gate:desktop-onboarding-state";
const BETTER_GATE_BASE_URL = "https://gateway.better-gate.com";
const BETTER_GATE_OPENAI_BASE_URL = `${BETTER_GATE_BASE_URL}/v1`;
const BETTER_GATE_HOME_URL = "https://better-gate.com";
const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-4-6";
const DEFAULT_CLAUDE_OPUS_MODEL = "claude-opus-4-8";
const DEFAULT_CLAUDE_HAIKU_MODEL = "claude-haiku-4-5";

type OnboardingStep = "workspace" | "tool" | "key" | "done";

type SavedOnboardingState = {
  step?: OnboardingStep;
  workspaceId?: string | null;
  toolId?: AppId;
  apiKeyId?: string | null;
};

type ToolOption = {
  id: AppId;
  title: string;
  description: string;
  restartName: string;
};

const toolOptions: ToolOption[] = [
  {
    id: "claude",
    title: "Claude Code",
    description: "用于 Claude Code 终端开发流程。",
    restartName: "Claude Code",
  },
  {
    id: "claude-desktop",
    title: "Claude Desktop",
    description: "用于 Claude 桌面端模型供应商配置。",
    restartName: "Claude Desktop",
  },
  {
    id: "codex",
    title: "Codex",
    description: "用于 Codex CLI 和 Codex 桌面端。",
    restartName: "Codex",
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    description: "用于 Gemini CLI 本地调用。",
    restartName: "Gemini CLI",
  },
  {
    id: "opencode",
    title: "OpenCode",
    description: "用于 OpenCode 的 OpenAI 兼容配置。",
    restartName: "OpenCode",
  },
  {
    id: "openclaw",
    title: "OpenClaw",
    description: "用于 OpenClaw 的 provider 配置。",
    restartName: "OpenClaw",
  },
  {
    id: "hermes",
    title: "Hermes",
    description: "用于 Hermes Agent 的 custom provider。",
    restartName: "Hermes",
  },
];

function isKnownToolId(value: unknown): value is AppId {
  return toolOptions.some((tool) => tool.id === value);
}

async function configureOnboardingWindow() {
  const currentWindow = getCurrentWindow();

  await currentWindow.setDecorations(false);
  await currentWindow.unmaximize().catch(() => undefined);
  await currentWindow.setResizable(false);
  await currentWindow.setMinimizable(false).catch(() => undefined);
  await currentWindow.setMaximizable(false).catch(() => undefined);
  await currentWindow.setSizeConstraints({
    minWidth: 720,
    minHeight: 560,
    maxWidth: 720,
    maxHeight: 560,
  });
  await currentWindow.setSize(new LogicalSize(720, 560));
  await currentWindow.center();
}

function OnboardingCloseButton() {
  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex h-9 items-center justify-end px-2"
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => void handleClose()}
        className="mac-window-controls absolute left-[14px] top-0 h-9 items-center"
        aria-label="关闭"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <span className="block h-3 w-3 rounded-full border border-red-500/30 bg-[#ff5f57]" />
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleClose()}
        className="windows-window-controls h-7 w-7 text-neutral-500 hover:bg-red-50 hover:text-red-500"
        aria-label="关闭"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <WindowControlIcon type="close" />
      </Button>
    </div>
  );
}

function getOnboardingStorageScope(user?: BetterGateDesktopUser | null) {
  if (!user?.id) {
    return null;
  }

  return `${getBetterGateSaasUrl()}|${user.id}`;
}

function getScopedStorageKey(
  baseKey: string,
  user?: BetterGateDesktopUser | null,
) {
  const scope = getOnboardingStorageScope(user);
  return scope ? `${baseKey}:${encodeURIComponent(scope)}` : baseKey;
}

function getSavedOnboardingState(user?: BetterGateDesktopUser | null): SavedOnboardingState {
  try {
    return JSON.parse(
      localStorage.getItem(getScopedStorageKey(ONBOARDING_STATE_KEY, user)) ||
        "{}",
    );
  } catch {
    localStorage.removeItem(getScopedStorageKey(ONBOARDING_STATE_KEY, user));
    return {};
  }
}

export function formatBetterGateBalance(units: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(units / 10_000);
}

export function getBetterGateWorkspaceTitle(
  workspace: BetterGateDesktopWorkspace,
  user?: BetterGateDesktopUser | null,
) {
  if (workspace.type !== "personal") {
    return workspace.name;
  }

  const name = user?.name?.trim();
  if (name) {
    return `${name}的工作区`;
  }

  const emailName = user?.email?.split("@")[0]?.trim();
  return emailName ? `${emailName}的工作区` : "我的工作区";
}

function getBetterGateImageSrc(image?: string | null) {
  const value = image?.trim();
  if (!value) {
    return null;
  }

  if (/^(https?:|blob:|data:)/.test(value)) {
    return value;
  }

  const baseUrl = getBetterGateSaasUrl();
  if (value.startsWith("/")) {
    return `${baseUrl}${value}`;
  }

  return `${baseUrl}/image-proxy/avatars/${value}`;
}

function OnboardingWorkspaceAvatar({
  workspace,
  user,
  className,
}: {
  workspace: BetterGateDesktopWorkspace;
  user?: BetterGateDesktopUser | null;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc =
    workspace.type === "personal"
      ? getBetterGateImageSrc(user?.image)
      : getBetterGateImageSrc(workspace.logo);

  useEffect(() => {
    setImageFailed(false);
  }, [workspace.id, workspace.logo, user?.id, user?.image]);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600",
        className,
      )}
    >
      {imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        getBetterGateWorkspaceTitle(workspace, user).slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function getToolOption(toolId: AppId) {
  return toolOptions.find((tool) => tool.id === toolId) ?? toolOptions[0];
}

export function getBetterGateDefaultKeyName(toolId: AppId) {
  return `${getToolOption(toolId).title} 接入 Key`;
}

export function getBetterGateApiKeyStatus(apiKey: BetterGateDesktopApiKey) {
  if (apiKey.status !== "ACTIVE") {
    return "已停用";
  }

  if (!apiKey.hasStoredSecret) {
    return "旧 Key";
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
  const usesLegacyClaudeFamily = input.apiKey.routeGroupModelFamily === "CLAUDE";
  const sonnetModel =
    usesLegacyClaudeFamily ? DEFAULT_CLAUDE_SONNET_MODEL : primaryModel;
  const opusModel =
    usesLegacyClaudeFamily ? DEFAULT_CLAUDE_OPUS_MODEL : primaryModel;
  const haikuModel =
    usesLegacyClaudeFamily ? DEFAULT_CLAUDE_HAIKU_MODEL : primaryModel;
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

export function isBetterGateOnboardingDone(user?: BetterGateDesktopUser | null) {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);

    if (params.get("resetOnboarding") === "1") {
      localStorage.removeItem(ONBOARDING_DONE_KEY);
      localStorage.removeItem(ONBOARDING_STATE_KEY);
      localStorage.removeItem(getScopedStorageKey(ONBOARDING_DONE_KEY, user));
      localStorage.removeItem(getScopedStorageKey(ONBOARDING_STATE_KEY, user));
      return false;
    }

    if (
      params.get("debugOnboarding") === "1" ||
      params.get("keepOnboarding") === "1"
    ) {
      return false;
    }

    if (params.get("preview") === "dashboard") {
      return true;
    }
  }

  return (
    Boolean(user?.id) &&
    localStorage.getItem(getScopedStorageKey(ONBOARDING_DONE_KEY, user)) ===
      "true"
  );
}

export function resetBetterGateOnboardingState(user?: BetterGateDesktopUser | null) {
  localStorage.removeItem(ONBOARDING_DONE_KEY);
  localStorage.removeItem(ONBOARDING_STATE_KEY);
  localStorage.removeItem(getScopedStorageKey(ONBOARDING_DONE_KEY, user));
  localStorage.removeItem(getScopedStorageKey(ONBOARDING_STATE_KEY, user));
}

export function prepareBetterGateOnboardingState(input: {
  user?: BetterGateDesktopUser | null;
  workspaceId?: string | null;
  toolId?: AppId;
  step?: Extract<OnboardingStep, "workspace" | "tool" | "key">;
}) {
  localStorage.setItem(
    getScopedStorageKey(ONBOARDING_STATE_KEY, input.user),
    JSON.stringify({
      step: input.step ?? "workspace",
      workspaceId: input.workspaceId ?? null,
      toolId: input.toolId,
      apiKeyId: null,
    }),
  );
}

interface BetterGateOnboardingProps {
  currentUser: BetterGateDesktopUser;
  onComplete: () => void;
}

export function BetterGateOnboarding({
  currentUser,
  onComplete,
}: BetterGateOnboardingProps) {
  const savedState = useMemo(
    () => getSavedOnboardingState(currentUser),
    [currentUser],
  );
  const [step, setStep] = useState<OnboardingStep>(
    savedState.step === "tool" || savedState.step === "key"
      ? savedState.step
      : "workspace",
  );
  const [workspaces, setWorkspaces] = useState<BetterGateDesktopWorkspace[]>(
    [],
  );
  const [user, setUser] = useState<BetterGateDesktopUser | null>(currentUser);
  const [apiKeys, setApiKeys] = useState<BetterGateDesktopApiKey[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    savedState.workspaceId ?? null,
  );
  const [selectedToolId, setSelectedToolId] = useState<AppId>(
    isKnownToolId(savedState.toolId) ? savedState.toolId : "codex",
  );
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(
    savedState.apiKeyId ?? null,
  );
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  );
  const selectedTool = getToolOption(selectedToolId);
  const selectedApiKey = useMemo(
    () => apiKeys.find((apiKey) => apiKey.id === selectedApiKeyId) ?? null,
    [apiKeys, selectedApiKeyId],
  );
  const personalWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type === "personal"),
    [workspaces],
  );
  const organizationWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type === "organization"),
    [workspaces],
  );
  const canCreateInSelectedWorkspace = Boolean(
    selectedWorkspace?.canCreateApiKey,
  );

  const loadUser = useCallback(async () => {
    try {
      const result = await getBetterGateDesktopMe();
      setUser(result.user);
    } catch (error) {
      console.error("[BetterGateOnboarding] failed to load user", error);
    }
  }, []);

  const primaryButtonLabel = useMemo(() => {
    if (step === "workspace") {
      return "继续";
    }

    if (step === "tool") {
      return "选择 API Key";
    }

    if (!selectedApiKey) {
      return "创建并接入";
    }

    if (!isBetterGateApiKeyDirectlyImportable(selectedApiKey)) {
      return "创建新 Key 并接入";
    }

    return `接入到 ${selectedTool.title}`;
  }, [selectedApiKey, selectedTool.title, step]);

  const loadWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    setErrorMessage(null);

    try {
      const result = await listBetterGateDesktopWorkspaces();
      setWorkspaces(result.workspaces);
      setSelectedWorkspaceId((current) => {
        if (result.workspaces.some((workspace) => workspace.id === current)) {
          return current;
        }

        return (
          result.workspaces.find((workspace) => workspace.type === "personal")
            ?.id ??
          result.workspaces[0]?.id ??
          null
        );
      });
    } catch (error) {
      console.error("[BetterGateOnboarding] failed to load workspaces", error);
      setErrorMessage("无法读取工作区，请确认控制台服务正常后重试。");
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, []);

  const loadApiKeys = useCallback(async (workspaceId: string) => {
    setIsLoadingApiKeys(true);
    setErrorMessage(null);

    try {
      const result = await listBetterGateDesktopApiKeys(workspaceId);
      const routeGroupDefaults = new Map(
        (result.routeGroups ?? []).map((group) => [
          group.key?.trim() || "standard",
          normalizeBetterGateDefaultModel(group.defaultModel ?? group.modelFamily),
        ]),
      );
      const nextApiKeys = sortBetterGateApiKeys(
        result.apiKeys.map((apiKey) => {
          const routeGroupKey = apiKey.routeGroup?.trim() || "standard";
          const routeGroupDefaultModel = normalizeBetterGateDefaultModel(
            apiKey.routeGroupDefaultModel ??
              apiKey.routeGroupModelFamily ??
              routeGroupDefaults.get(routeGroupKey),
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
    } catch (error) {
      console.error("[BetterGateOnboarding] failed to load api keys", error);
      setErrorMessage("无法读取 API Key，请确认控制台服务正常后重试。");
    } finally {
      setIsLoadingApiKeys(false);
    }
  }, []);

  useEffect(() => {
    void configureOnboardingWindow().catch((error) => {
      console.error("[BetterGateOnboarding] failed to configure window", error);
    });
  }, []);

  useEffect(() => {
    void loadUser();
    void loadWorkspaces();
  }, [loadUser, loadWorkspaces]);

  useEffect(() => {
    if (
      !selectedWorkspaceId ||
      !selectedWorkspace ||
      selectedWorkspace.id !== selectedWorkspaceId
    ) {
      setApiKeys([]);
      setSelectedApiKeyId(null);
      return;
    }

    void loadApiKeys(selectedWorkspaceId);
  }, [loadApiKeys, selectedWorkspace, selectedWorkspaceId]);

  useEffect(() => {
    localStorage.setItem(
      getScopedStorageKey(ONBOARDING_STATE_KEY, user),
      JSON.stringify({
        step,
        workspaceId: selectedWorkspaceId,
        toolId: selectedToolId,
        apiKeyId: selectedApiKeyId,
      }),
    );
  }, [selectedApiKeyId, selectedToolId, selectedWorkspaceId, step, user]);

  const importSecret = useCallback(
    async (secret: string, apiKey: BetterGateDesktopApiKey) => {
      if (!user || !selectedWorkspace) {
        setErrorMessage("请先选择一个工作区。");
        return;
      }

      const provider = createBetterGateProvider({
        toolId: selectedToolId,
        user,
        workspace: selectedWorkspace,
        apiKey,
        secret,
      });

      await providersApi.add(provider, selectedToolId, true);
      await providersApi.switch(provider.id, selectedToolId);

      setStep("done");
      toast.success(`已导入到 ${getToolOption(selectedToolId).title}`, {
        closeButton: true,
      });
    },
    [selectedToolId, selectedWorkspace, user],
  );

  const handleCreateAndImport = async () => {
    if (!selectedWorkspace) {
      setErrorMessage("请先选择一个工作区。");
      return;
    }

    if (!selectedWorkspace.canCreateApiKey) {
      setErrorMessage("当前工作区无法创建 API Key，请联系组织管理员处理。");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const result = await createBetterGateDesktopApiKey({
        workspaceId: selectedWorkspace.id,
        name: getBetterGateDefaultKeyName(selectedToolId),
        tool: selectedTool.title,
      });
      const createdApiKey = {
        ...result.apiKey,
        routeGroupDefaultModel: normalizeBetterGateDefaultModel(
          result.apiKey.routeGroupDefaultModel ?? result.apiKey.routeGroupModelFamily,
        ),
        routeGroupModelFamily:
          result.apiKey.routeGroupModelFamily ??
          normalizeBetterGateModelFamily(
            result.apiKey.routeGroupDefaultModel ?? result.apiKey.routeGroupModelFamily,
          ),
      };
      const nextApiKeys = sortBetterGateApiKeys([createdApiKey, ...apiKeys]);

      setApiKeys(nextApiKeys);
      setSelectedApiKeyId(createdApiKey.id);
      await importSecret(result.secret, createdApiKey);
    } catch (error) {
      console.error("[BetterGateOnboarding] failed to create api key", error);
      setErrorMessage("创建 API Key 失败，请检查权限后重试。");
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportSelectedKey = async () => {
    if (!selectedWorkspace) {
      setErrorMessage("请先选择一个工作区。");
      return;
    }

    if (
      !selectedApiKey ||
      !isBetterGateApiKeyDirectlyImportable(selectedApiKey)
    ) {
      await handleCreateAndImport();
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
        await handleCreateAndImport();
        return;
      }

      await importSecret(result.secret, selectedApiKey);
    } catch (error) {
      console.error("[BetterGateOnboarding] failed to reveal api key", error);
      setErrorMessage("读取 API Key 失败，请确认你有权限使用这个 Key。");
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrimaryAction = () => {
    if (step === "workspace") {
      if (!selectedWorkspace) {
        setErrorMessage("请先选择一个工作区。");
        return;
      }

      setErrorMessage(null);
      setStep("tool");
      return;
    }

    if (step === "tool") {
      setErrorMessage(null);
      setStep("key");
      return;
    }

    void handleImportSelectedKey();
  };

  const handleToolSelect = (toolId: AppId) => {
    setSelectedToolId(toolId);
    setStep("key");
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedApiKeyId(null);
  };

  const handleBack = () => {
    setErrorMessage(null);

    if (step === "key") {
      setStep("tool");
      return;
    }

    if (step === "tool") {
      setStep("workspace");
    }
  };

  const handleComplete = () => {
    const shouldSkipDonePersistence =
      import.meta.env.DEV &&
      ["debugOnboarding", "keepOnboarding"].some(
        (key) => new URLSearchParams(window.location.search).get(key) === "1",
      );

    if (!shouldSkipDonePersistence) {
      localStorage.setItem(getScopedStorageKey(ONBOARDING_DONE_KEY, user), "true");
    }

    onComplete();
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-neutral-950">
      <OnboardingCloseButton />

      <main className="mx-auto flex h-full w-[560px] flex-col px-2 pb-8 pt-14">
        {step === "done" ? (
          <div className="flex flex-1 flex-col justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-normal">
              接入完成
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              已写入 {selectedTool.title}。重启客户端后生效。
            </p>
            {selectedWorkspace ? (
              <div className="mt-6 space-y-1">
                <div className="flex h-[56px] items-center gap-3 rounded-xl bg-neutral-50 px-3">
                  <OnboardingWorkspaceAvatar
                    workspace={selectedWorkspace}
                    user={user}
                    className="h-8 w-8 bg-white"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-950">
                      {getBetterGateWorkspaceTitle(selectedWorkspace, user)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-400">
                      {selectedApiKey?.name ?? "新建 API Key"}
                    </span>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "workspace" ? (
          <>
            <div className="flex h-10 items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">
                1 / 3
              </span>
            </div>

            <div className="mt-3 px-3">
              <h1 className="text-2xl font-semibold leading-tight tracking-normal">
                选择工作区
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                决定余额和 API Key 来源
              </p>
            </div>

            <section className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {isLoadingWorkspaces ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
                </div>
              ) : workspaces.length ? (
                <div className="space-y-3">
                  {[
                    ["个人工作区", personalWorkspaces],
                    ["组织工作区", organizationWorkspaces],
                  ].map(([label, sectionWorkspaces]) =>
                    (sectionWorkspaces as BetterGateDesktopWorkspace[])
                      .length ? (
                      <div key={label as string} className="space-y-1">
                        <div className="px-3 text-[11px] font-medium text-neutral-400">
                          {label as string}
                        </div>
                        {(sectionWorkspaces as BetterGateDesktopWorkspace[]).map(
                          (workspace) => {
                            const selected =
                              selectedWorkspaceId === workspace.id;

                            return (
                              <button
                                key={workspace.id}
                                type="button"
                                onClick={() =>
                                  handleWorkspaceSelect(workspace.id)
                                }
                                className={cn(
                                  "flex h-[60px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                                  selected
                                    ? "bg-neutral-50"
                                    : "hover:bg-neutral-50",
                                )}
                              >
                                <OnboardingWorkspaceAvatar
                                  workspace={workspace}
                                  user={user}
                                  className="h-9 w-9"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-neutral-950">
                                    {getBetterGateWorkspaceTitle(
                                      workspace,
                                      user,
                                    )}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-neutral-400">
                                    {formatBetterGateBalance(
                                      workspace.availableBalanceCents,
                                    )}
                                  </span>
                                </span>
                                {selected ? (
                                  <Check className="h-4 w-4 shrink-0 text-neutral-950" />
                                ) : null}
                              </button>
                            );
                          },
                        )}
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold">暂无可用工作区</p>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    请先在 Better Gate 控制台创建或加入工作区。
                  </p>
                </div>
              )}
            </section>
          </>
        ) : null}

        {step === "tool" ? (
          <>
            <div className="flex h-10 items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={isBusy}
                className="flex h-8 items-center rounded-lg px-2 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回
              </button>
              <span className="text-xs font-medium text-neutral-400">
                2 / 3
              </span>
            </div>

            <div className="mt-3 px-3">
              <h1 className="text-2xl font-semibold leading-tight tracking-normal">
                选择工具
              </h1>
              <p className="mt-1 truncate text-sm text-neutral-500">
                {selectedWorkspace
                  ? getBetterGateWorkspaceTitle(selectedWorkspace, user)
                  : "选择要接入的客户端"}
              </p>
            </div>

            <section className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-1">
                {toolOptions.map((tool) => {
                  const config = APP_ICON_MAP[tool.id];
                  const selected = selectedToolId === tool.id;

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleToolSelect(tool.id)}
                      className={cn(
                        "flex h-[60px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                        selected ? "bg-neutral-50" : "hover:bg-neutral-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700",
                        )}
                      >
                        {config.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {tool.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-400">
                          {tool.description}
                        </span>
                      </span>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-neutral-950" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {step === "key" ? (
          <>
            <div className="flex h-10 items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={isBusy}
                className="flex h-8 items-center rounded-lg px-2 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回
              </button>

              <button
                type="button"
                onClick={() =>
                  selectedWorkspaceId && void loadApiKeys(selectedWorkspaceId)
                }
                disabled={isBusy || isLoadingApiKeys || !selectedWorkspaceId}
                className="flex h-8 items-center rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50"
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                {APP_ICON_MAP[selectedTool.id].icon}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold text-neutral-950">
                  {selectedTool.title}
                </h1>
                <p className="mt-0.5 truncate text-xs text-neutral-400">
                  {selectedWorkspace
                    ? getBetterGateWorkspaceTitle(selectedWorkspace, user)
                    : "未选择工作区"}
                </p>
              </div>
            </div>

            <section className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <div className="px-3 pb-1 pt-3 text-xs font-medium text-neutral-400">
                API Key
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

                    return (
                      <button
                        key={apiKey.id}
                        type="button"
                        onClick={() => setSelectedApiKeyId(apiKey.id)}
                        className={cn(
                          "flex h-[60px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                          selected ? "bg-neutral-50" : "hover:bg-neutral-50",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                          <KeyRound className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-neutral-950">
                            {apiKey.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-neutral-400">
                            {apiKey.keyPrefix} ·{" "}
                            {apiKey.routeGroup || "默认分组"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            directImportable
                              ? "bg-emerald-50 text-emerald-700"
                              : apiKey.status === "ACTIVE"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-neutral-100 text-neutral-500",
                          )}
                        >
                          {getBetterGateApiKeyStatus(apiKey)}
                        </span>
                        {selected ? (
                          <Check className="h-4 w-4 shrink-0 text-neutral-950" />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="flex h-[60px] items-center gap-3 rounded-xl px-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-950">
                        新建 API Key
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-400">
                        当前工作区暂无可导入 Key
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {selectedApiKey &&
              !isBetterGateApiKeyDirectlyImportable(selectedApiKey) ? (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  该 Key 无法直接读取，继续时会创建一个新 Key。
                </div>
              ) : null}
              <p className="mt-3 px-3 text-xs text-neutral-400">
                接入完成后，请重启 {selectedTool.restartName}。
              </p>
            </section>
          </>
        ) : null}

        {errorMessage ? (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
            {errorMessage}
          </div>
        ) : (
          <div className="mt-3 h-9" />
        )}

        <div className="mt-auto flex items-center justify-between">
          {step === "done" ? (
            <span />
          ) : step === "tool" || step === "key" ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isBusy}
              className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-medium leading-none text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700 disabled:pointer-events-none disabled:opacity-50"
            >
              暂时跳过
            </button>
          ) : (
            <span />
          )}

          {step === "done" ? (
            <Button
              onClick={handleComplete}
              className="h-10 rounded-xl bg-neutral-950 px-5 text-white hover:bg-neutral-800"
            >
              进入客户端
            </Button>
          ) : (
            <Button
              onClick={handlePrimaryAction}
              className="h-10 rounded-xl bg-neutral-950 px-5 text-white hover:bg-neutral-800 disabled:bg-neutral-300"
              disabled={
                isBusy ||
                isLoadingWorkspaces ||
                isLoadingApiKeys ||
                (step === "workspace" && !selectedWorkspace) ||
                (step === "key" &&
                  (!selectedWorkspace ||
                    (!selectedApiKey && !canCreateInSelectedWorkspace) ||
                    (Boolean(selectedApiKey) &&
                      !isBetterGateApiKeyDirectlyImportable(selectedApiKey) &&
                      !canCreateInSelectedWorkspace)))
              }
            >
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {primaryButtonLabel}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
