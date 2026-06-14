import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  User,
  Users2,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { BetterGateToolConnectPage } from "@/components/BetterGateToolConnectPage";
import { WindowControlIcon } from "@/components/WindowControlIcon";
import { replayBetterGateOnboarding } from "@/components/BetterGateLoginGate";
import { useUpdate } from "@/contexts/UpdateContext";
import { APP_ICON_MAP } from "@/config/appConfig";
import betterGateIcon from "@/assets/icons/better-gate-icon-black.svg";
import { providersApi, settingsApi } from "@/lib/api";
import type { AppId } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  clearBetterGateDesktopToken,
  getBetterGateDesktopMe,
  getBetterGateDesktopUsageSummary,
  getBetterGateSaasUrl,
  isBetterGateDesktopPreview,
  listBetterGateDesktopApiKeys,
  listBetterGateDesktopWorkspaces,
  type BetterGateDesktopUser,
  type BetterGateDesktopUsageSummaryResponse,
  type BetterGateDesktopWorkspace,
} from "@/lib/api/betterGateDesktop";
import {
  getBetterGateProviderApiKeyId,
  isBetterGateProvider,
  isBetterGateProviderForContext,
} from "@/lib/betterGateConnect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SELECTED_WORKSPACE_KEY = "better-gate:desktop-dashboard-workspace";
const BETTER_GATE_DOCS_URL = "https://docs.better-gate.com";
const BILLING_UNITS_PER_USD = 10_000;

type ToolOption = {
  id: AppId;
  title: string;
  tabTitle?: string;
};

type ToolDirectoryOption = {
  id: AppId;
  title: string;
};

type ToolStatus = {
  configured: boolean;
  name?: string;
  apiKeyId?: string | null;
};

const toolOptions: ToolOption[] = [
  {
    id: "claude",
    title: "Claude Code CLI",
    tabTitle: "Claude",
  },
  {
    id: "codex",
    title: "Codex",
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    tabTitle: "Gemini",
  },
  {
    id: "claude-desktop",
    title: "Claude Code Desktop",
    tabTitle: "Desktop",
  },
  {
    id: "opencode",
    title: "OpenCode",
  },
  {
    id: "openclaw",
    title: "OpenClaw",
  },
  {
    id: "hermes",
    title: "Hermes",
  },
];

const DASHBOARD_WINDOW_SIZE = {
  width: 460,
  height: 650,
};

const dashboardToolDirectories: ToolDirectoryOption[] = [
  {
    id: "codex",
    title: "Codex",
  },
  {
    id: "claude",
    title: "Claude Code CLI",
  },
  {
    id: "claude-desktop",
    title: "Claude Code Desktop",
  },
  {
    id: "gemini",
    title: "Gemini CLI",
  },
  {
    id: "opencode",
    title: "OpenCode",
  },
  {
    id: "openclaw",
    title: "OpenClaw",
  },
  {
    id: "hermes",
    title: "Hermes",
  },
];

async function configureDashboardWindow() {
  const currentWindow = getCurrentWindow();
  const dashboardSize = new LogicalSize(
    DASHBOARD_WINDOW_SIZE.width,
    DASHBOARD_WINDOW_SIZE.height,
  );

  await currentWindow.setDecorations(false);
  await currentWindow.setSizeConstraints(null).catch(() => undefined);
  await currentWindow.setSizeConstraints({
    minWidth: DASHBOARD_WINDOW_SIZE.width,
    minHeight: DASHBOARD_WINDOW_SIZE.height,
    maxWidth: DASHBOARD_WINDOW_SIZE.width,
    maxHeight: DASHBOARD_WINDOW_SIZE.height,
  });
  await currentWindow.setResizable(false);
  await currentWindow.setMinimizable(true).catch(() => undefined);
  await currentWindow.setMaximizable(false).catch(() => undefined);
  await currentWindow.unmaximize().catch(() => undefined);
  await currentWindow.setSize(dashboardSize);
  await currentWindow.center();
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

function formatBillingUnits(units?: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format((units ?? 0) / BILLING_UNITS_PER_USD);
}

function formatCompactNumber(value?: number | null) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function getUserWorkspaceTitle(user?: BetterGateDesktopUser | null) {
  const name = user?.name?.trim();
  if (name) {
    return `${name}的工作区`;
  }

  const emailName = user?.email?.split("@")[0]?.trim();
  return emailName ? `${emailName}的工作区` : "我的工作区";
}

function getWorkspaceTitle(
  workspace: BetterGateDesktopWorkspace,
  user?: BetterGateDesktopUser | null,
) {
  return workspace.type === "personal"
    ? getUserWorkspaceTitle(user)
    : workspace.name;
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

function getWorkspaceLogoSrc(workspace: BetterGateDesktopWorkspace) {
  return workspace.type === "personal"
    ? null
    : getBetterGateImageSrc(workspace.logo);
}

function getWorkspaceFallbackLabel(
  workspace: BetterGateDesktopWorkspace,
  user?: BetterGateDesktopUser | null,
) {
  const title = getWorkspaceTitle(workspace, user).trim();
  return title.slice(0, 1).toUpperCase() || "B";
}

function WindowControls() {
  return (
    <>
      <div
        className="mac-window-controls absolute left-[14px] top-0 z-[70] h-11 items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          onClick={() => void getCurrentWindow().close()}
          className="h-3 w-3 rounded-full border border-red-500/30 bg-[#ff5f57] transition-opacity hover:opacity-90"
          aria-label="关闭"
        />
        <button
          type="button"
          onClick={() => void getCurrentWindow().minimize()}
          className="h-3 w-3 rounded-full border border-yellow-500/30 bg-[#ffbd2e] transition-opacity hover:opacity-90"
          aria-label="最小化"
        />
      </div>
      <div
        className="windows-window-controls absolute right-1.5 top-0 z-[70] h-11 items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void getCurrentWindow().minimize()}
          className="h-8 w-8 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          aria-label="最小化"
        >
          <WindowControlIcon type="minimize" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void getCurrentWindow().close()}
          className="h-8 w-8 text-neutral-500 hover:bg-red-50 hover:text-red-500 dark:text-neutral-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
          aria-label="关闭"
        >
          <WindowControlIcon type="close" />
        </Button>
      </div>
    </>
  );
}

function WorkspaceAvatar({
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
      : getWorkspaceLogoSrc(workspace);

  useEffect(() => {
    setImageFailed(false);
  }, [workspace.id, workspace.logo, user?.id, user?.image]);

  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden text-xs font-semibold text-neutral-600",
        "rounded-lg bg-neutral-200",
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
      ) : workspace.type === "personal" ? (
        <User className="h-4 w-4" />
      ) : workspace.type === "organization" ? (
        <Users2 className="h-4 w-4" />
      ) : (
        getWorkspaceFallbackLabel(workspace, user)
      )}
    </span>
  );
}

function TitlebarIconButton({
  label,
  active,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "no-drag relative flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition",
            "hover:bg-neutral-200/70 hover:text-neutral-950 focus:bg-neutral-200/70 focus:text-neutral-950",
            "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:focus:bg-neutral-800 dark:focus:text-neutral-100",
            "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
          )}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {icon}
          {active ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function WorkspaceSwitcher({
  user,
  workspaces,
  selectedWorkspace,
  selectedWorkspaceId,
  isLoading,
  onSelect,
}: {
  user: BetterGateDesktopUser | null;
  workspaces: BetterGateDesktopWorkspace[];
  selectedWorkspace: BetterGateDesktopWorkspace | null;
  selectedWorkspaceId: string | null;
  isLoading: boolean;
  onSelect: (workspaceId: string) => void;
}) {
  const personalWorkspaces = workspaces.filter(
    (workspace) => workspace.type === "personal",
  );
  const organizationWorkspaces = workspaces.filter(
    (workspace) => workspace.type === "organization",
  );

  const renderWorkspaceSection = (
    label: string,
    sectionWorkspaces: BetterGateDesktopWorkspace[],
  ) => {
    if (!sectionWorkspaces.length) {
      return null;
    }

    return (
      <Fragment key={label}>
        <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          {label}
        </DropdownMenuLabel>
        {sectionWorkspaces.map((workspace) => {
          const selected = workspace.id === selectedWorkspaceId;

          return (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => onSelect(workspace.id)}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-neutral-50 dark:data-[highlighted]:bg-neutral-800"
            >
              <WorkspaceAvatar
                workspace={workspace}
                user={user}
                className={cn("h-7 w-7", "rounded-md")}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-950 dark:text-neutral-50">
                  {getWorkspaceTitle(workspace, user)}
                </span>
              </span>
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-neutral-950 dark:text-neutral-50" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </Fragment>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isLoading || !workspaces.length}
          className="no-drag inline-flex h-7 max-w-[150px] items-center gap-1.5 rounded-lg px-1.5 text-left text-neutral-700 outline-none transition hover:bg-neutral-200/70 hover:text-neutral-950 focus:bg-neutral-200/70 focus:text-neutral-950 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:text-neutral-400 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus:bg-neutral-800 dark:focus:text-neutral-50 dark:disabled:text-neutral-500"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span className="min-w-0 max-w-[126px]">
            <span className="block truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
              {selectedWorkspace
                ? getWorkspaceTitle(selectedWorkspace, user)
                : "读取工作区"}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500 dark:text-neutral-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[236px] rounded-xl border-neutral-200 bg-white p-1 shadow-lg outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      >
        {renderWorkspaceSection("个人工作区", personalWorkspaces)}
        {renderWorkspaceSection("组织工作区", organizationWorkspaces)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({
  user,
  onOpenConsole,
  onReplayOnboarding,
  onLogout,
}: {
  user: BetterGateDesktopUser | null;
  onOpenConsole: () => void;
  onReplayOnboarding: () => void;
  onLogout: () => void;
}) {
  const displayName = user?.name?.trim() || "Better Gate";
  const email = user?.email?.trim() || "已登录";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="no-drag flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 outline-none transition hover:bg-neutral-200/70 hover:text-neutral-950 focus:bg-neutral-200/70 focus:text-neutral-950 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus:bg-neutral-800 dark:focus:text-neutral-50"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          aria-label="账号"
        >
          <User className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[236px] rounded-xl border-neutral-200 bg-white p-1 shadow-lg outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-neutral-950 dark:text-neutral-50">
            {displayName}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">
            {email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onOpenConsole}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-neutral-50 dark:data-[highlighted]:bg-neutral-800"
        >
          <ExternalLink className="h-4 w-4 text-neutral-500" />
          控制台
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onReplayOnboarding}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-neutral-50 dark:data-[highlighted]:bg-neutral-800"
        >
          <RefreshCw className="h-4 w-4 text-neutral-500" />
          新手引导
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 text-xs font-medium text-neutral-400 dark:text-neutral-500">
      {children}
    </div>
  );
}

function DashboardUsageSummary({
  balanceUnits,
  summary,
}: {
  balanceUnits: number;
  summary: BetterGateDesktopUsageSummaryResponse | null;
}) {
  const metrics = [
    {
      label: "可用余额",
      value: formatBillingUnits(balanceUnits),
    },
    {
      label: "今日用量",
      value: `${formatCompactNumber(summary?.usage.today.totalTokens)} Tokens`,
    },
    {
      label: "本月用量",
      value: `${formatCompactNumber(summary?.usage.month.totalTokens)} Tokens`,
    },
  ];

  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-w-0 rounded-xl bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800/60"
        >
          <div className="truncate text-[11px] font-medium leading-4 text-neutral-400 dark:text-neutral-500">
            {metric.label}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold leading-5 text-neutral-950 dark:text-neutral-50">
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardToolDirectoryRow({
  item,
  status,
  onOpen,
}: {
  item: ToolDirectoryOption;
  status?: ToolStatus;
  onOpen: (toolId: AppId) => void;
}) {
  const icon = APP_ICON_MAP[item.id]?.icon ?? (
    <ExternalLink className="h-4 w-4" />
  );
  const isConfigured = Boolean(status?.configured);
  const keyName = status?.name?.trim() || "Better Gate Key";
  const statusText = isConfigured ? `已接入 ${keyName}` : "未选择 Key";
  const actionLabel =
    status?.configured && status.name
      ? `更换 ${status.name}`
      : `接入 ${item.title}`;

  return (
    <div className="flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1 -translate-y-px">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold leading-4 text-neutral-950 dark:text-neutral-50">
            {item.title}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none",
              isConfigured
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
            )}
          >
            {isConfigured ? "已接入" : "未接入"}
          </span>
        </div>
        <div
          className="mt-1 truncate text-xs leading-4 text-neutral-400 dark:text-neutral-500"
          title={statusText}
        >
          {statusText}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onOpen(item.id)}
        className="h-8 w-8 shrink-0 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
        title={actionLabel}
        aria-label={actionLabel}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DashboardToolDirectoryList({
  statuses,
  onOpenTool,
}: {
  statuses: Partial<Record<AppId, ToolStatus>>;
  onOpenTool: (toolId: AppId) => void;
}) {
  return (
    <div className="space-y-1">
      {dashboardToolDirectories.map((item) => (
        <DashboardToolDirectoryRow
          key={item.id}
          item={item}
          status={statuses[item.id]}
          onOpen={onOpenTool}
        />
      ))}
    </div>
  );
}

export function BetterGateDashboard() {
  const { checkUpdate, hasUpdate, isChecking, updateInfo } = useUpdate();
  const isPreview = isBetterGateDesktopPreview();
  const [user, setUser] = useState<BetterGateDesktopUser | null>(null);
  const [workspaces, setWorkspaces] = useState<BetterGateDesktopWorkspace[]>(
    [],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_WORKSPACE_KEY),
  );
  const [summary, setSummary] =
    useState<BetterGateDesktopUsageSummaryResponse | null>(null);
  const [toolStatuses, setToolStatuses] = useState<
    Partial<Record<AppId, ToolStatus>>
  >({});
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [activeToolId, setActiveToolId] = useState<AppId | null>(null);
  const [activeApiKeyId, setActiveApiKeyId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  );
  const activeTool = useMemo(
    () => toolOptions.find((tool) => tool.id === activeToolId) ?? null,
    [activeToolId],
  );
  const balanceUnits =
    summary?.balance.availableBalanceCents ??
    selectedWorkspace?.availableBalanceCents ??
    0;
  const todayTokens = summary?.usage.today.totalTokens ?? 0;

  const loadToolStatuses = useCallback(async () => {
    if (!user || !selectedWorkspace) {
      setToolStatuses({});
      return;
    }

    try {
      const keyNamesById = new Map<string, string>();

      try {
        const result = await listBetterGateDesktopApiKeys(selectedWorkspace.id);
        for (const apiKey of result.apiKeys) {
          keyNamesById.set(apiKey.id, apiKey.name);
        }
      } catch (error) {
        console.warn(
          "[BetterGateDashboard] failed to load api key names for statuses",
          error,
        );
      }

      const entries = await Promise.all(
        toolOptions.map(async (tool) => {
          const [providers, currentProviderId] = await Promise.all([
            providersApi.getAll(tool.id),
            providersApi.getCurrent(tool.id),
          ]);
          const provider = providers[currentProviderId] ?? null;
          const apiKeyId = getBetterGateProviderApiKeyId(provider, tool.id);
          const hasKeyInCurrentWorkspace = Boolean(
            apiKeyId && keyNamesById.has(apiKeyId),
          );
          const isCurrentBetterGateProvider =
            isBetterGateProviderForContext(provider, {
              user,
              workspace: selectedWorkspace,
            }) ||
            (isBetterGateProvider(provider) && hasKeyInCurrentWorkspace);

          return [
            tool.id,
            {
              configured: isCurrentBetterGateProvider,
              name: isCurrentBetterGateProvider
                ? keyNamesById.get(apiKeyId ?? "") || provider?.name
                : undefined,
              apiKeyId: isCurrentBetterGateProvider ? apiKeyId : null,
            },
          ] as const;
        }),
      );

      setToolStatuses(Object.fromEntries(entries));
    } catch (error) {
      console.error(
        "[BetterGateDashboard] failed to load tool statuses",
        error,
      );
      if (!isBetterGateDesktopPreview()) {
        toast.error("读取工具接入状态失败", { closeButton: true });
      }
    }
  }, [selectedWorkspace, user]);

  const loadUser = useCallback(async () => {
    try {
      const result = await getBetterGateDesktopMe();
      setUser(result.user);
    } catch (error) {
      console.error("[BetterGateDashboard] failed to load user", error);
    }
  }, []);

  const loadSummary = useCallback(async (workspaceId: string) => {
    setErrorMessage(null);

    try {
      const result = await getBetterGateDesktopUsageSummary({
        workspaceId,
        days: 7,
        timeZone: getLocalTimeZone(),
      });

      setSummary(result);
    } catch (error) {
      console.error("[BetterGateDashboard] failed to load summary", error);
      setErrorMessage("无法读取余额和用量，稍后可刷新重试。");
    }
  }, []);

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
      console.error("[BetterGateDashboard] failed to load workspaces", error);
      setErrorMessage("无法读取工作区，请检查登录状态或网络后重试。");
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    if (isPreview) {
      return;
    }

    void configureDashboardWindow().catch((error) => {
      console.error("[BetterGateDashboard] failed to configure window", error);
    });
  }, [isPreview]);

  useEffect(() => {
    if (!isPreview) {
      return;
    }

    document.body.classList.add("is-bettergate-dashboard-preview");
    return () => {
      document.body.classList.remove("is-bettergate-dashboard-preview");
    };
  }, [isPreview]);

  useEffect(() => {
    void loadUser();
    void loadWorkspaces();
  }, [loadUser, loadWorkspaces]);

  useEffect(() => {
    void loadToolStatuses();
  }, [loadToolStatuses]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSummary(null);
      return;
    }

    if (
      !workspaces.length ||
      !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ) {
      return;
    }

    localStorage.setItem(SELECTED_WORKSPACE_KEY, selectedWorkspaceId);
    void loadSummary(selectedWorkspaceId);
  }, [loadSummary, selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (isBetterGateDesktopPreview()) {
      return;
    }

    void providersApi
      .updateBetterGateTrayContext({
        workspaceLabel: selectedWorkspace
          ? getWorkspaceTitle(selectedWorkspace, user)
          : undefined,
        balanceLabel: formatBillingUnits(balanceUnits),
        todayTokensLabel: formatCompactNumber(todayTokens),
      })
      .catch((error) => {
        console.warn(
          "[BetterGateDashboard] failed to update tray context",
          error,
        );
      });
  }, [balanceUnits, selectedWorkspace, todayTokens, user]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadWorkspaces(),
      loadToolStatuses(),
      selectedWorkspaceId
        ? loadSummary(selectedWorkspaceId)
        : Promise.resolve(),
    ]);
  }, [loadSummary, loadToolStatuses, loadWorkspaces, selectedWorkspaceId]);

  const handleOpenTool = useCallback((toolId: AppId) => {
    setIsSettingsOpen(false);
    setActiveApiKeyId(null);
    setActiveToolId(toolId);
  }, []);

  const handleToolConnectComplete = (status?: ToolStatus) => {
    if (activeToolId && status) {
      setToolStatuses((current) => ({
        ...current,
        [activeToolId]: status,
      }));
    }

    setActiveToolId(null);
    setActiveApiKeyId(null);
    void loadToolStatuses();
    if (selectedWorkspaceId) {
      void loadSummary(selectedWorkspaceId);
    }
  };

  const handleOpenConsole = async () => {
    await settingsApi.openExternal(getBetterGateSaasUrl());
  };

  const handleOpenDocs = async () => {
    await settingsApi.openExternal(BETTER_GATE_DOCS_URL);
  };

  const handleOpenSettings = () => {
    setActiveToolId(null);
    setActiveApiKeyId(null);
    setIsSettingsOpen(true);
  };

  const handleLogout = () => {
    clearBetterGateDesktopToken();
  };

  const handleCheckUpdate = async () => {
    try {
      if (isBetterGateDesktopPreview()) {
        toast.info("预览模式不检查更新", { closeButton: true });
        return;
      }

      const available = await checkUpdate({ revealDismissed: true });
      toast.success(available ? "发现新版本" : "当前已是最新版本", {
        closeButton: true,
      });
    } catch (error) {
      console.error("[BetterGateDashboard] failed to check update", error);
      toast.error("检查更新失败", { closeButton: true });
    }
  };

  return (
    <div
      className={cn(
        "bettergate-client relative flex h-screen w-screen flex-col overflow-hidden bg-[#F6F6F6] text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100",
        isPreview && "bettergate-client-preview-frame",
      )}
      style={
        isPreview
          ? ({
              width: DASHBOARD_WINDOW_SIZE.width,
              height: DASHBOARD_WINDOW_SIZE.height,
              minWidth: DASHBOARD_WINDOW_SIZE.width,
              maxWidth: DASHBOARD_WINDOW_SIZE.width,
              minHeight: DASHBOARD_WINDOW_SIZE.height,
              maxHeight: DASHBOARD_WINDOW_SIZE.height,
            } as CSSProperties)
          : undefined
      }
    >
      <header
        className="relative flex h-11 shrink-0 items-center bg-[#F6F6F6] dark:bg-neutral-950"
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="dashboard-titlebar-content flex h-full min-w-0 flex-1 items-center justify-between pl-3.5">
          <div className="dashboard-workspace-titlebar flex min-w-0 items-center gap-2.5">
            <img
              src={betterGateIcon}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 shrink-0 translate-y-px opacity-90 dark:invert"
              draggable={false}
            />
            <div
              className="no-drag w-auto max-w-[172px]"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <WorkspaceSwitcher
                user={user}
                workspaces={workspaces}
                selectedWorkspace={selectedWorkspace}
                selectedWorkspaceId={selectedWorkspaceId}
                isLoading={isLoadingWorkspaces}
                onSelect={setSelectedWorkspaceId}
              />
            </div>
          </div>
          <div className="flex h-full items-center justify-end gap-1">
            <TooltipProvider delayDuration={200}>
              <TitlebarIconButton
                label={
                  hasUpdate && updateInfo?.availableVersion
                    ? `发现 v${updateInfo.availableVersion}`
                    : "检查更新"
                }
                active={hasUpdate}
                disabled={isChecking}
                icon={
                  <RefreshCw
                    className={cn("h-4 w-4", isChecking && "animate-spin")}
                  />
                }
                onClick={() => void handleCheckUpdate()}
              />
              <TitlebarIconButton
                label="帮助文档"
                icon={<BookOpen className="h-4 w-4" />}
                onClick={() => void handleOpenDocs()}
              />
              <TitlebarIconButton
                label="设置"
                icon={<Settings className="h-4 w-4" />}
                onClick={handleOpenSettings}
              />
            </TooltipProvider>
            <AccountMenu
              user={user}
              onOpenConsole={() => void handleOpenConsole()}
              onReplayOnboarding={replayBetterGateOnboarding}
              onLogout={handleLogout}
            />
          </div>
        </div>
        <WindowControls />
      </header>

      <main className="min-h-0 flex-1 bg-white dark:bg-neutral-900">
        <section className="flex h-full min-w-0 flex-col border-t border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {activeTool ? (
              <div className="h-full overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
                <BetterGateToolConnectPage
                  tool={activeTool}
                  user={user}
                  selectedWorkspace={selectedWorkspace}
                  selectedWorkspaceId={selectedWorkspaceId}
                  isLoadingWorkspaces={isLoadingWorkspaces}
                  initialApiKeyId={activeApiKeyId}
                  openConfigForApiKeyId={activeApiKeyId}
                  onBack={() => {
                    setActiveToolId(null);
                    setActiveApiKeyId(null);
                  }}
                  onComplete={handleToolConnectComplete}
                />
              </div>
            ) : isSettingsOpen ? (
              <div className="h-full overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
                <SettingsPage
                  open={isSettingsOpen}
                  onOpenChange={setIsSettingsOpen}
                  onImportSuccess={handleRefresh}
                />
              </div>
            ) : isLoadingWorkspaces && !workspaces.length ? (
              <div className="flex h-full items-center justify-center rounded-xl bg-white dark:bg-neutral-900">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : (
              <div className="min-h-full bg-white dark:bg-neutral-900">
                <TooltipProvider delayDuration={200}>
                  <div className="flex min-h-full flex-col justify-center">
                    {errorMessage ? (
                      <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                        {errorMessage}
                      </div>
                    ) : null}
                    <DashboardUsageSummary
                      balanceUnits={balanceUnits}
                      summary={summary}
                    />
                    <DashboardSectionLabel>接入工具</DashboardSectionLabel>
                    <DashboardToolDirectoryList
                      statuses={toolStatuses}
                      onOpenTool={handleOpenTool}
                    />
                  </div>
                </TooltipProvider>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
