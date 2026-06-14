import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brush,
  Check,
  ExternalLink,
  FolderOpen,
  Globe2,
  Info,
  Loader2,
  Monitor,
  Moon,
  PanelTopClose,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { APP_ICON_MAP } from "@/config/appConfig";
import { useUpdate } from "@/contexts/UpdateContext";
import { settingsApi } from "@/lib/api";
import { isBetterGateDesktopPreview } from "@/lib/api/betterGateDesktop";
import { isLinux, isMac, isWindows } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import type {
  ResolvedDirectories,
  SettingsFormState,
} from "@/hooks/useSettings";
import type { DirectoryAppId } from "@/hooks/useDirectorySettings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void | Promise<void>;
  defaultTab?: string;
}

type ThemeValue = "light" | "dark" | "system";

type TerminalOption = {
  value: string;
  label: string;
};

type DirectoryConfig = {
  id: DirectoryAppId;
  title: string;
  field: keyof SettingsFormState;
  resolvedKey: keyof Omit<ResolvedDirectories, "appConfig">;
};

const themeOptions: {
  value: ThemeValue;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
];

const directoryConfigs: DirectoryConfig[] = [
  {
    id: "claude",
    title: "Claude Code",
    field: "claudeConfigDir",
    resolvedKey: "claude",
  },
  {
    id: "codex",
    title: "Codex",
    field: "codexConfigDir",
    resolvedKey: "codex",
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    field: "geminiConfigDir",
    resolvedKey: "gemini",
  },
  {
    id: "opencode",
    title: "OpenCode",
    field: "opencodeConfigDir",
    resolvedKey: "opencode",
  },
  {
    id: "openclaw",
    title: "OpenClaw",
    field: "openclawConfigDir",
    resolvedKey: "openclaw",
  },
  {
    id: "hermes",
    title: "Hermes",
    field: "hermesConfigDir",
    resolvedKey: "hermes",
  },
];

const previewSettings: SettingsFormState = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  launchOnStartup: false,
  silentStartup: false,
  useAppWindowControls: false,
  enableClaudePluginIntegration: true,
  preserveCodexOfficialAuthOnSwitch: true,
  preferredTerminal: isWindows() ? "powershell" : "terminal",
  language: "zh",
};

const previewResolvedDirs: ResolvedDirectories = {
  appConfig: "C:\\Users\\Max\\.better-gate-client",
  claude: "C:\\Users\\Max\\.claude",
  codex: "C:\\Users\\Max\\.codex",
  gemini: "C:\\Users\\Max\\.gemini",
  opencode: "C:\\Users\\Max\\.config\\opencode",
  openclaw: "C:\\Users\\Max\\.openclaw",
  hermes: "C:\\Users\\Max\\.hermes",
};

function getTerminalOptions(): TerminalOption[] {
  if (isWindows()) {
    return [
      { value: "cmd", label: "Command Prompt" },
      { value: "powershell", label: "PowerShell" },
      { value: "wt", label: "Windows Terminal" },
    ];
  }

  if (isLinux()) {
    return [
      { value: "gnome-terminal", label: "GNOME Terminal" },
      { value: "konsole", label: "Konsole" },
      { value: "xfce4-terminal", label: "Xfce Terminal" },
      { value: "alacritty", label: "Alacritty" },
      { value: "kitty", label: "Kitty" },
      { value: "ghostty", label: "Ghostty" },
    ];
  }

  return [
    { value: "terminal", label: "Terminal" },
    { value: "iterm2", label: "iTerm2" },
    { value: "warp", label: "Warp" },
    { value: "alacritty", label: "Alacritty" },
    { value: "kitty", label: "Kitty" },
    { value: "ghostty", label: "Ghostty" },
    { value: "wezterm", label: "WezTerm" },
  ];
}

function getDefaultTerminal() {
  if (isWindows()) return "cmd";
  if (isLinux()) return "gnome-terminal";
  return "terminal";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 text-xs font-medium text-neutral-400">
      {children}
    </div>
  );
}

function SettingsTab({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-8 rounded-lg px-3 text-xs text-neutral-500 shadow-none transition data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-950 data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  );
}

function SettingRow({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-neutral-50",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-neutral-950">
          {title}
        </div>
        {description ? (
          <div className="mt-0.5 truncate text-xs text-neutral-400">
            {description}
          </div>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

function ToggleSettingRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingRow icon={icon} title={title} description={description}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </SettingRow>
  );
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingRow
      icon={<Brush className="h-4 w-4" />}
      title="外观"
      description="选择客户端的显示主题"
    >
      <div className="inline-flex rounded-lg bg-neutral-100 p-1">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition",
                active
                  ? "bg-white text-neutral-950 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-950",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </SettingRow>
  );
}

function DirectoryRow({
  item,
  settings,
  resolvedDirs,
  onBrowse,
  onReset,
}: {
  item: DirectoryConfig;
  settings: SettingsFormState;
  resolvedDirs: ResolvedDirectories;
  onBrowse: (app: DirectoryAppId) => Promise<void>;
  onReset: (app: DirectoryAppId) => Promise<void>;
}) {
  const icon = APP_ICON_MAP[item.id]?.icon ?? (
    <FolderOpen className="h-4 w-4" />
  );
  const customValue = settings[item.field];
  const path = String(customValue || resolvedDirs[item.resolvedKey] || "");

  return (
    <div className="flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-neutral-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold text-neutral-950">
            {item.title}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
              customValue
                ? "bg-neutral-950 text-white"
                : "bg-neutral-100 text-neutral-500",
            )}
          >
            {customValue ? "自定义" : "默认"}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-neutral-400" title={path}>
          {path || "未检测到配置目录"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void onBrowse(item.id)}
          className="h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          title="选择目录"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void onReset(item.id)}
          className="h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          title="恢复默认"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AboutRow({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <SettingRow icon={icon} title={title} description={description}>
      {children}
    </SettingRow>
  );
}

export function SettingsPage({
  open,
  onOpenChange,
  defaultTab = "app",
}: SettingsDialogProps) {
  const isPreview = isBetterGateDesktopPreview();
  const {
    settings,
    isLoading,
    isSaving,
    isPortable,
    resolvedDirs,
    browseDirectory,
    resetDirectory,
    saveSettings,
    autoSaveSettings,
    updateSettings,
    requiresRestart,
    acknowledgeRestart,
  } = useSettings();
  const { hasUpdate, updateInfo, checkUpdate, isChecking } = useUpdate();

  const [activeTab, setActiveTab] = useState<string>("app");
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const effectiveSettings = settings ?? (isPreview ? previewSettings : null);
  const effectiveResolvedDirs = isPreview ? previewResolvedDirs : resolvedDirs;

  const terminalOptions = useMemo(() => getTerminalOptions(), []);
  const terminalValue =
    effectiveSettings?.preferredTerminal || getDefaultTerminal();
  const isBusy = useMemo(
    () => !isPreview && isLoading && !settings,
    [isLoading, isPreview, settings],
  );
  const needsSave = activeTab === "tools";

  useEffect(() => {
    if (open) {
      setActiveTab(
        ["app", "tools", "about"].includes(defaultTab) ? defaultTab : "app",
      );
    }
  }, [open, defaultTab]);

  useEffect(() => {
    if (requiresRestart) {
      setShowRestartPrompt(true);
    }
  }, [requiresRestart]);

  useEffect(() => {
    if (isPreview) {
      setVersion("3.16.1");
      return;
    }

    let active = true;

    void getVersion()
      .then((nextVersion) => {
        if (active) {
          setVersion(nextVersion);
        }
      })
      .catch(() => {
        if (active) {
          setVersion(null);
        }
      });

    return () => {
      active = false;
    };
  }, [isPreview]);

  const closeAfterSave = useCallback(() => {
    acknowledgeRestart();
    onOpenChange(false);
  }, [acknowledgeRestart, onOpenChange]);

  const handleAutoSave = useCallback(
    async (updates: Partial<SettingsFormState>) => {
      if (isPreview) {
        toast.info("预览模式不会保存设置", { closeButton: true });
        return;
      }
      if (!settings) return;
      updateSettings(updates);
      try {
        await autoSaveSettings(updates);
      } catch (error) {
        console.error("[SettingsPage] Failed to autosave settings", error);
        toast.error("保存失败，请重试");
      }
    },
    [autoSaveSettings, isPreview, settings, updateSettings],
  );

  const handleSave = useCallback(async () => {
    if (isPreview) {
      toast.info("预览模式不会保存设置", { closeButton: true });
      return;
    }

    try {
      const result = await saveSettings(undefined, { silent: false });
      if (!result) return;
      if (result.requiresRestart) {
        setShowRestartPrompt(true);
        return;
      }
      closeAfterSave();
    } catch (error) {
      console.error("[SettingsPage] Failed to save settings", error);
    }
  }, [closeAfterSave, isPreview, saveSettings]);

  const handleRestartLater = useCallback(() => {
    setShowRestartPrompt(false);
    closeAfterSave();
  }, [closeAfterSave]);

  const handleRestartNow = useCallback(async () => {
    setShowRestartPrompt(false);
    if (import.meta.env.DEV) {
      toast.success("开发模式下请手动重启客户端", { closeButton: true });
      closeAfterSave();
      return;
    }

    try {
      await settingsApi.restart();
    } catch (error) {
      console.error("[SettingsPage] Failed to restart app", error);
      toast.error("重启失败，请手动重新打开客户端");
    } finally {
      closeAfterSave();
    }
  }, [closeAfterSave]);

  const handleToggleLaunch = useCallback(
    (enabled: boolean) => {
      void handleAutoSave({
        launchOnStartup: enabled,
        ...(enabled ? {} : { silentStartup: false }),
      });
    },
    [handleAutoSave],
  );

  const handleOpenExternal = useCallback(
    async (url: string) => {
      try {
        if (isPreview) {
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        await settingsApi.openExternal(url);
      } catch (error) {
        console.error("[SettingsPage] Failed to open external url", error);
        toast.error("打开链接失败");
      }
    },
    [isPreview],
  );

  const handleCheckUpdate = useCallback(async () => {
    try {
      if (isPreview) {
        toast.info("预览模式不检查更新", { closeButton: true });
        return;
      }
      const available = await checkUpdate();
      toast.success(available ? "发现新版本" : "当前已是最新版本", {
        closeButton: true,
      });
    } catch (error) {
      console.error("[SettingsPage] Failed to check update", error);
      toast.error("检查更新失败");
    }
  }, [checkUpdate, isPreview]);

  const handleBrowseDirectory = useCallback(
    async (app: DirectoryAppId) => {
      if (isPreview) {
        toast.info("预览模式不会选择目录", { closeButton: true });
        return;
      }
      await browseDirectory(app);
    },
    [browseDirectory, isPreview],
  );

  const handleResetDirectory = useCallback(
    async (app: DirectoryAppId) => {
      if (isPreview) {
        toast.info("预览模式不会修改目录", { closeButton: true });
        return;
      }
      await resetDirectory(app);
    },
    [isPreview, resetDirectory],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isBusy ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex h-10 items-center justify-between">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 items-center rounded-lg px-2 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回
            </button>
          </div>

          <TabsList className="mt-3 flex h-10 w-full justify-start gap-1 rounded-none bg-transparent px-3 py-0">
            <SettingsTab value="app">应用</SettingsTab>
            <SettingsTab value="tools">本地配置</SettingsTab>
            <SettingsTab value="about">关于</SettingsTab>
          </TabsList>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <TabsContent value="app" className="mt-0">
                {effectiveSettings ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-1"
                  >
                    <SectionLabel>界面</SectionLabel>
                    <ThemeSelector />

                    <SectionLabel>窗口</SectionLabel>
                    <ToggleSettingRow
                      icon={<Power className="h-4 w-4" />}
                      title="开机自启"
                      description="登录系统后自动启动 Better Gate"
                      checked={!!effectiveSettings.launchOnStartup}
                      onChange={handleToggleLaunch}
                    />
                    <ToggleSettingRow
                      icon={<Sparkles className="h-4 w-4" />}
                      title="静默启动"
                      description="开机自启时不主动显示主窗口"
                      checked={!!effectiveSettings.silentStartup}
                      disabled={!effectiveSettings.launchOnStartup}
                      onChange={(value) =>
                        void handleAutoSave({ silentStartup: value })
                      }
                    />
                    <ToggleSettingRow
                      icon={<PanelTopClose className="h-4 w-4" />}
                      title="关闭后最小化"
                      description="点击关闭按钮时保留在托盘或菜单栏"
                      checked={!!effectiveSettings.minimizeToTrayOnClose}
                      onChange={(value) =>
                        void handleAutoSave({ minimizeToTrayOnClose: value })
                      }
                    />
                    <ToggleSettingRow
                      icon={<Monitor className="h-4 w-4" />}
                      title={isMac() ? "显示菜单栏图标" : "显示托盘图标"}
                      description="在系统菜单栏或托盘中保留快捷入口"
                      checked={!!effectiveSettings.showInTray}
                      onChange={(value) =>
                        void handleAutoSave({ showInTray: value })
                      }
                    />
                    {isLinux() ? (
                      <ToggleSettingRow
                        icon={<Settings2 className="h-4 w-4" />}
                        title="使用应用窗口按钮"
                        description="在 Linux 下显示应用内窗口控制按钮"
                        checked={!!effectiveSettings.useAppWindowControls}
                        onChange={(value) =>
                          void handleAutoSave({ useAppWindowControls: value })
                        }
                      />
                    ) : null}

                    <SectionLabel>兼容</SectionLabel>
                    <ToggleSettingRow
                      icon={<Zap className="h-4 w-4" />}
                      title="Claude Code 配置同步"
                      description="接入时自动写入所需的 Claude Code 配置"
                      checked={
                        !!effectiveSettings.enableClaudePluginIntegration
                      }
                      onChange={(value) =>
                        void handleAutoSave({
                          enableClaudePluginIntegration: value,
                        })
                      }
                    />
                    <ToggleSettingRow
                      icon={<ShieldCheck className="h-4 w-4" />}
                      title="保留 Codex 官方登录"
                      description="接入 Better Gate 后继续保留 Codex 官方账号能力"
                      checked={
                        !!effectiveSettings.preserveCodexOfficialAuthOnSwitch
                      }
                      onChange={(value) =>
                        void handleAutoSave({
                          preserveCodexOfficialAuthOnSwitch: value,
                        })
                      }
                    />
                  </motion.div>
                ) : null}
              </TabsContent>

              <TabsContent value="tools" className="mt-0 pb-4">
                {effectiveSettings ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-1"
                  >
                    <SectionLabel>配置文件目录</SectionLabel>
                    {directoryConfigs.map((item) => (
                      <DirectoryRow
                        key={item.id}
                        item={item}
                        settings={effectiveSettings}
                        resolvedDirs={effectiveResolvedDirs}
                        onBrowse={handleBrowseDirectory}
                        onReset={handleResetDirectory}
                      />
                    ))}

                    <SectionLabel>终端</SectionLabel>
                    <SettingRow
                      icon={<TerminalSquare className="h-4 w-4" />}
                      title="默认终端"
                      description="用于执行检测、安装和导入命令"
                    >
                      <Select
                        value={terminalValue}
                        onValueChange={(terminal) =>
                          void handleAutoSave({ preferredTerminal: terminal })
                        }
                      >
                        <SelectTrigger className="h-8 w-[168px] rounded-lg border-neutral-200 text-xs shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {terminalOptions.map((terminal) => (
                            <SelectItem
                              key={terminal.value}
                              value={terminal.value}
                            >
                              {terminal.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingRow>
                  </motion.div>
                ) : null}
              </TabsContent>

              <TabsContent value="about" className="mt-0 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1"
                >
                  <SectionLabel>应用信息</SectionLabel>
                  <AboutRow
                    icon={<Info className="h-4 w-4" />}
                    title="Better Gate"
                    description={`当前版本 ${version ? `v${version}` : "未知"}${
                      isPortable ? " · 便携模式" : ""
                    }`}
                  >
                    {hasUpdate ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        可更新
                      </span>
                    ) : (
                      <Check className="h-4 w-4 text-emerald-600" />
                    )}
                  </AboutRow>
                  <AboutRow
                    icon={<RefreshCw className="h-4 w-4" />}
                    title="版本更新"
                    description={
                      hasUpdate && updateInfo?.availableVersion
                        ? `发现 v${updateInfo.availableVersion}`
                        : "检查是否有新的客户端版本"
                    }
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCheckUpdate()}
                      disabled={isChecking}
                      className="h-8 rounded-lg px-2.5 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
                    >
                      <RefreshCw
                        className={cn(
                          "mr-1.5 h-3.5 w-3.5",
                          isChecking && "animate-spin",
                        )}
                      />
                      检查
                    </Button>
                  </AboutRow>

                  <SectionLabel>链接</SectionLabel>
                  <AboutRow
                    icon={<Globe2 className="h-4 w-4" />}
                    title="官网"
                    description="better-gate.com"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void handleOpenExternal("https://better-gate.com")
                      }
                      className="h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                      title="打开官网"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </AboutRow>
                  <AboutRow
                    icon={<ExternalLink className="h-4 w-4" />}
                    title="帮助文档"
                    description="查看接入教程和常见问题"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void handleOpenExternal("https://docs.better-gate.com")
                      }
                      className="h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                      title="打开文档"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </AboutRow>
                </motion.div>
              </TabsContent>
            </div>

            {needsSave && effectiveSettings ? (
              <div className="flex-shrink-0 border-t border-neutral-100 bg-white pt-3">
                <div className="flex items-center justify-between gap-3 px-3">
                  <span className="truncate text-xs text-neutral-400">
                    配置文件目录修改后保存生效
                  </span>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-9 rounded-lg bg-neutral-950 px-4 text-xs text-white hover:bg-neutral-800"
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    保存
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Tabs>
      )}

      <Dialog
        open={showRestartPrompt}
        onOpenChange={(dialogOpen) => !dialogOpen && handleRestartLater()}
      >
        <DialogContent zIndex="alert" className="max-w-md border-border">
          <DialogHeader>
            <DialogTitle>需要重启客户端</DialogTitle>
          </DialogHeader>
          <div className="px-6">
            <p className="text-sm leading-6 text-neutral-500">
              部分设置需要重启后生效。你可以现在重启，也可以稍后手动重新打开客户端。
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleRestartLater}>
              稍后重启
            </Button>
            <Button onClick={handleRestartNow}>立即重启</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
