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
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Hash,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  User,
  Users2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { APP_ICON_MAP } from "@/config/appConfig";
import { Button } from "@/components/ui/button";
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
import { SettingsPage } from "@/components/settings/SettingsPage";
import { BetterGateToolConnectPage } from "@/components/BetterGateToolConnectPage";
import { WindowControlIcon } from "@/components/WindowControlIcon";
import { replayBetterGateOnboarding } from "@/components/BetterGateLoginGate";
import { useUpdate } from "@/contexts/UpdateContext";
import { providersApi, settingsApi } from "@/lib/api";
import type { AppId } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import betterGateIcon from "@/assets/icons/better-gate-icon-black.svg";
import {
  clearBetterGateDesktopToken,
  getBetterGateDesktopMe,
  getBetterGateDesktopUsageSummary,
  getBetterGateSaasUrl,
  isBetterGateDesktopPreview,
  listBetterGateDesktopWorkspaces,
  type BetterGateDesktopUser,
  type BetterGateDesktopUsageSummaryResponse,
  type BetterGateDesktopWorkspace,
} from "@/lib/api/betterGateDesktop";

const SELECTED_WORKSPACE_KEY = "better-gate:desktop-dashboard-workspace";
const BETTER_GATE_DOCS_URL = "https://docs.better-gate.com";
const BILLING_UNITS_PER_USD = 10_000;

type ToolOption = {
  id: AppId;
  title: string;
};

type ToolStatus = {
  configured: boolean;
  name?: string;
};

const toolOptions: ToolOption[] = [
  {
    id: "claude",
    title: "Claude Code",
  },
  {
    id: "codex",
    title: "Codex",
  },
  {
    id: "gemini",
    title: "Gemini CLI",
  },
  {
    id: "claude-desktop",
    title: "Claude Desktop",
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

  await currentWindow.setDecorations(false);
  await currentWindow.setSizeConstraints({
    minWidth: 820,
    minHeight: 560,
  });
  await currentWindow.setResizable(true);
  await currentWindow.setMinimizable(true).catch(() => undefined);
  await currentWindow.setMaximizable(true).catch(() => undefined);

  if (!(await currentWindow.isMaximized())) {
    await currentWindow.setSize(new LogicalSize(900, 600));
    await currentWindow.center();
  }
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

function isBetterGateProvider(provider: {
  id: string;
  icon?: string;
  notes?: string;
}) {
  return (
    provider.id.startsWith("better-gate-") ||
    provider.icon === "bettergate" ||
    provider.notes?.includes("Better Gate")
  );
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const sync = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        if (active) {
          setIsMaximized(maximized);
        }
      } catch {
        // Window state is best-effort in dev.
      }
    };

    void (async () => {
      await sync();
      unlisten = await getCurrentWindow().onResized(() => {
        void sync();
      });
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return (
    <>
      <div
        className="mac-window-controls fixed left-[14px] top-0 z-[70] h-11 items-center gap-2"
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
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const currentWindow = getCurrentWindow();
              await currentWindow.toggleMaximize();
              setIsMaximized(await currentWindow.isMaximized());
            })();
          }}
          className="h-3 w-3 rounded-full border border-green-500/30 bg-[#28c840] transition-opacity hover:opacity-90"
          aria-label={isMaximized ? "还原" : "最大化"}
        />
      </div>
      <div
        className="windows-window-controls items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void getCurrentWindow().minimize()}
          className="h-8 w-8 text-neutral-500 hover:bg-neutral-100"
          aria-label="最小化"
        >
          <WindowControlIcon type="minimize" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void (async () => {
              const currentWindow = getCurrentWindow();
              await currentWindow.toggleMaximize();
              setIsMaximized(await currentWindow.isMaximized());
            })();
          }}
          className="h-8 w-8 text-neutral-500 hover:bg-neutral-100"
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          <WindowControlIcon type={isMaximized ? "restore" : "maximize"} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void getCurrentWindow().close()}
          className="h-8 w-8 text-neutral-500 hover:bg-red-50 hover:text-red-500"
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
            "hover:bg-neutral-200/70 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-50",
            "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
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
          className="no-drag inline-flex h-7 max-w-[150px] items-center gap-1 rounded-lg px-1.5 text-left outline-none transition hover:bg-neutral-200/70 hover:text-neutral-950 focus:bg-neutral-200/70 focus:text-neutral-950 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus:bg-neutral-800 dark:focus:text-neutral-50"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span className="min-w-0 max-w-[126px]">
            <span className="block truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
              {selectedWorkspace
                ? getWorkspaceTitle(selectedWorkspace, user)
                : "读取工作区"}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-400" />
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
  onOpenSettings,
  onReplayOnboarding,
  onLogout,
}: {
  user: BetterGateDesktopUser | null;
  onOpenConsole: () => void;
  onOpenSettings: () => void;
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
          onSelect={onOpenSettings}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-neutral-50 dark:data-[highlighted]:bg-neutral-800"
        >
          <Settings className="h-4 w-4 text-neutral-500" />
          设置
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

function HomeUsagePanel({
  summary,
  balanceUnits,
  isLoading,
  onRecharge,
}: {
  summary: BetterGateDesktopUsageSummaryResponse | null;
  balanceUnits: number;
  isLoading: boolean;
  onRecharge: () => void;
}) {
  const todayTokens = summary?.usage.today.totalTokens ?? 0;
  const monthTokens = summary?.usage.month.totalTokens ?? 0;
  const todayCost = summary?.usage.today.costCents ?? 0;
  const todayRequests = summary?.usage.today.requests ?? 0;

  const stats = [
    {
      label: "今日 Token",
      value: formatCompactNumber(todayTokens),
      icon: <Hash className="h-3.5 w-3.5" />,
    },
    {
      label: "本月 Token",
      value: formatCompactNumber(monthTokens),
      icon: <BarChart3 className="h-3.5 w-3.5" />,
    },
    {
      label: "今日扣费",
      value: formatBillingUnits(todayCost),
      icon: <CircleDollarSign className="h-3.5 w-3.5" />,
    },
    {
      label: "今日请求",
      value: formatCompactNumber(todayRequests),
      icon: <Activity className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <section className="grid min-h-[144px] grid-cols-[1.1fr_1fr] gap-3 rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-800/40">
      <div className="relative overflow-hidden rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
              <Wallet className="h-3.5 w-3.5" />
              可用余额
            </div>
            <div className="mt-2 flex items-center gap-2">
              <p className="truncate text-2xl font-semibold leading-none tracking-normal text-neutral-950 dark:text-neutral-50">
                {formatBillingUnits(balanceUnits)}
              </p>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRecharge}
              className="inline-flex h-7 items-center justify-center rounded-lg bg-neutral-100 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              充值
            </button>
            <span className="truncate text-[11px] text-neutral-400">
              数据来自当前工作区
            </span>
          </div>
        </div>

        <div className="pointer-events-none absolute right-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full opacity-70">
          <div
            className="h-full w-full rounded-full"
            style={{
              background:
                "repeating-conic-gradient(from 0deg, rgba(212, 212, 216, 0.5) 0deg 18deg, transparent 18deg 30deg)",
            }}
          />
          <div className="absolute inset-[10px] rounded-full bg-white dark:bg-neutral-900" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="min-w-0 rounded-2xl bg-white px-3 py-3 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                {stat.icon}
              </span>
              <span className="truncate text-base font-semibold leading-none text-neutral-950 dark:text-neutral-50">
                {stat.value}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-neutral-400">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolRow({
  tool,
  status,
  onConnect,
}: {
  tool: ToolOption;
  status?: ToolStatus;
  onConnect: (toolId: AppId) => void;
}) {
  const icon = APP_ICON_MAP[tool.id].icon;
  const configured = status?.configured;
  const detail = configured
    ? `已接入 ${status?.name || "Better Gate Key"}`
    : "未接入";
  const actionLabel = configured ? "更改接入" : "接入工具";

  return (
    <div className="group grid h-14 min-w-0 grid-cols-[46px_minmax(0,1fr)_32px] items-center gap-3 rounded-xl transition hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30">
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 bg-transparent text-[22px] transition dark:border-neutral-700 [&_[data-brand-icon]]:!h-6 [&_[data-brand-icon]]:!w-6 [&_img]:h-6 [&_img]:w-6 [&_svg]:h-6 [&_svg]:w-6",
          configured
            ? "text-neutral-950 dark:text-neutral-100"
            : "text-neutral-600 dark:text-neutral-300",
        )}
      >
        {icon}
      </span>

      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold leading-5 text-neutral-950 dark:text-neutral-50">
          {tool.title}
        </h3>
        <p
          className={cn(
            "truncate text-xs leading-5",
            configured
              ? "text-neutral-500 dark:text-neutral-400"
              : "text-neutral-500 dark:text-neutral-400",
          )}
        >
          {detail}
        </p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onConnect(tool.id)}
            aria-label={
              configured ? `更改 ${tool.title} 接入` : `接入 ${tool.title}`
            }
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition",
              configured
                ? "bg-transparent hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:hover:text-white",
            )}
          >
            {configured ? (
              <Check className="h-4 w-4 stroke-[1.8]" />
            ) : (
              <Plus className="h-4 w-4 stroke-[2.2]" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
        >
          {actionLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function DocsTutorialRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid h-14 min-w-0 grid-cols-[46px_minmax(0,1fr)_32px] items-center gap-3 rounded-xl text-left transition hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 bg-transparent text-neutral-600 transition group-hover:text-neutral-950 dark:border-neutral-700 dark:text-neutral-300 dark:group-hover:text-neutral-100">
        <FileText className="h-5 w-5 stroke-[1.8]" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-5 text-neutral-950 dark:text-neutral-50">
          使用文档
        </span>
        <span className="block truncate text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          查看接入教程
        </span>
      </span>

      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:hover:text-white">
        <ArrowRight className="h-4 w-4 stroke-[1.9]" />
      </span>
    </button>
  );
}

export function BetterGateDashboard() {
  const { checkUpdate, hasUpdate, isChecking, updateInfo } = useUpdate();
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
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [activeToolId, setActiveToolId] = useState<AppId | null>(null);
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
    try {
      const entries = await Promise.all(
        toolOptions.map(async (tool) => {
          const providers = await providersApi.getAll(tool.id);
          const provider = Object.values(providers).find(isBetterGateProvider);
          const configured = Boolean(provider);

          return [
            tool.id,
            {
              configured,
              name: configured ? provider?.name : undefined,
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
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const result = await getBetterGateDesktopMe();
      setUser(result.user);
    } catch (error) {
      console.error("[BetterGateDashboard] failed to load user", error);
    }
  }, []);

  const loadSummary = useCallback(async (workspaceId: string) => {
    setIsLoadingSummary(true);
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
    } finally {
      setIsLoadingSummary(false);
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
    void configureDashboardWindow().catch((error) => {
      console.error("[BetterGateDashboard] failed to configure window", error);
    });
  }, []);

  useEffect(() => {
    void loadUser();
    void loadWorkspaces();
    void loadToolStatuses();
  }, [loadToolStatuses, loadUser, loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSummary(null);
      return;
    }

    localStorage.setItem(SELECTED_WORKSPACE_KEY, selectedWorkspaceId);
    void loadSummary(selectedWorkspaceId);
  }, [loadSummary, selectedWorkspaceId]);

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

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void handleRefresh();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [handleRefresh]);

  const handleConnectTool = (toolId: AppId) => {
    setIsSettingsOpen(false);
    setActiveToolId(toolId);
  };

  const handleToolConnectComplete = (status?: ToolStatus) => {
    if (activeToolId && status) {
      setToolStatuses((current) => ({
        ...current,
        [activeToolId]: status,
      }));
    }

    setActiveToolId(null);
    void loadToolStatuses();
    if (selectedWorkspaceId) {
      void loadSummary(selectedWorkspaceId);
    }
  };

  const handleOpenConsole = async () => {
    await settingsApi.openExternal(getBetterGateSaasUrl());
  };

  const handleOpenBilling = async () => {
    await settingsApi.openExternal(`${getBetterGateSaasUrl()}/billing`);
  };

  const handleOpenDocs = async () => {
    await settingsApi.openExternal(BETTER_GATE_DOCS_URL);
  };

  const handleOpenSettings = () => {
    setActiveToolId(null);
    setIsSettingsOpen(true);
  };

  const handleCheckUpdate = async () => {
    try {
      if (isBetterGateDesktopPreview()) {
        toast.info("预览模式不检查更新", { closeButton: true });
        return;
      }

      const available = await checkUpdate();
      toast.success(available ? "发现新版本" : "当前已是最新版本", {
        closeButton: true,
      });
    } catch (error) {
      console.error("[BetterGateDashboard] failed to check update", error);
      toast.error("检查更新失败", { closeButton: true });
    }
  };

  const handleLogout = () => {
    clearBetterGateDesktopToken();
    toast.success("已退出 Better Gate 客户端登录", { closeButton: true });
  };

  return (
    <div className="bettergate-client flex h-screen w-screen flex-col overflow-hidden bg-[#F6F6F6] text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <header
        className="flex h-11 shrink-0 items-center bg-[#F6F6F6] dark:bg-neutral-950"
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="bettergate-dashboard-brand flex h-full shrink-0 items-center gap-2 px-4 pr-3">
          <img
            src={betterGateIcon}
            alt="Better Gate"
            className="bettergate-brand-icon h-5 w-5"
          />
          <span className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
            Better Gate
          </span>
        </div>
        <div className="flex h-full min-w-0 flex-1 items-center px-2">
          <div className="ml-auto flex h-full items-center justify-end gap-1">
            <div
              className="no-drag mr-0.5 w-auto max-w-[150px]"
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
                label="设置"
                icon={<Settings className="h-4 w-4" />}
                onClick={handleOpenSettings}
              />
            </TooltipProvider>
            <AccountMenu
              user={user}
              onOpenConsole={() => void handleOpenConsole()}
              onOpenSettings={handleOpenSettings}
              onReplayOnboarding={replayBetterGateOnboarding}
              onLogout={handleLogout}
            />
            <WindowControls />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 bg-white dark:bg-neutral-900">
        <section className="flex h-full min-w-0 flex-col border-t border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-3">
            {activeTool ? (
              <div className="h-full overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
                <BetterGateToolConnectPage
                  tool={activeTool}
                  user={user}
                  selectedWorkspace={selectedWorkspace}
                  selectedWorkspaceId={selectedWorkspaceId}
                  isLoadingWorkspaces={isLoadingWorkspaces}
                  onBack={() => setActiveToolId(null)}
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
              <div className="flex h-full items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : (
              <div className="mx-auto flex h-full max-w-[760px] flex-col px-1 pb-1 pt-6">
                <TooltipProvider delayDuration={200}>
                  {errorMessage ? (
                    <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                      {errorMessage}
                    </div>
                  ) : null}
                  <HomeUsagePanel
                    summary={summary}
                    balanceUnits={balanceUnits}
                    isLoading={isLoadingSummary}
                    onRecharge={() => void handleOpenBilling()}
                  />
                  <p className="mb-4 mt-6 text-[13px] leading-5 text-neutral-400 dark:text-neutral-500">
                    选择一个工具，将 Better Gate Key
                    写入本地配置。切换后请重启对应客户端。
                  </p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    {toolOptions.map((tool) => (
                      <ToolRow
                        key={tool.id}
                        tool={tool}
                        status={toolStatuses[tool.id]}
                        onConnect={handleConnectTool}
                      />
                    ))}
                    <DocsTutorialRow onOpen={() => void handleOpenDocs()} />
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
