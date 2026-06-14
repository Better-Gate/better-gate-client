import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { WindowControlIcon } from "@/components/WindowControlIcon";
import {
  BetterGateOnboarding,
  isBetterGateOnboardingDone,
  resetBetterGateOnboardingState,
} from "@/components/BetterGateOnboarding";
import { settingsApi } from "@/lib/api";
import betterGateIcon from "@/assets/icons/better-gate-icon-black.svg";
import {
  BETTER_GATE_DESKTOP_SIGNED_OUT_EVENT,
  clearBetterGateDesktopToken,
  getBetterGateDesktopMe,
  getBetterGateSaasUrl,
  pollBetterGateDesktopLogin,
  setBetterGateDesktopToken,
  startBetterGateDesktopLogin,
  type BetterGateDesktopUser,
} from "@/lib/api/betterGateDesktop";

type AuthState = "checking" | "signedOut" | "waiting" | "signedIn" | "error";

const REPLAY_ONBOARDING_EVENT = "better-gate:replay-onboarding";
const AUTH_WINDOW_SIZE = {
  width: 460,
  height: 650,
};

interface BetterGateLoginGateProps {
  children: React.ReactNode;
}

async function configureLoginWindow() {
  const currentWindow = getCurrentWindow();
  const authSize = new LogicalSize(
    AUTH_WINDOW_SIZE.width,
    AUTH_WINDOW_SIZE.height,
  );

  await currentWindow.setDecorations(false);
  await currentWindow.setSizeConstraints(null).catch(() => undefined);
  await currentWindow.unmaximize().catch(() => undefined);
  await currentWindow.setResizable(false);
  await currentWindow.setMinimizable(false).catch(() => undefined);
  await currentWindow.setMaximizable(false).catch(() => undefined);
  await currentWindow.setSizeConstraints({
    minWidth: AUTH_WINDOW_SIZE.width,
    minHeight: AUTH_WINDOW_SIZE.height,
    maxWidth: AUTH_WINDOW_SIZE.width,
    maxHeight: AUTH_WINDOW_SIZE.height,
  });
  await currentWindow.setSize(authSize);
  await currentWindow.center();
}

function AuthCloseButton() {
  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex h-11 items-center justify-end px-2"
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => void handleClose()}
        className="mac-window-controls absolute left-[14px] top-0 h-11 items-center"
        aria-label="关闭"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span className="block h-3 w-3 rounded-full border border-red-500/30 bg-[#ff5f57]" />
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleClose()}
        className="windows-window-controls h-8 w-8 text-neutral-500 hover:bg-red-50 hover:text-red-500"
        aria-label="关闭"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <WindowControlIcon type="close" />
      </Button>
    </div>
  );
}

export function BetterGateLoginGate({ children }: BetterGateLoginGateProps) {
  const pollRunRef = useRef(0);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<BetterGateDesktopUser | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);

  const checkSession = useCallback(async () => {
    setAuthState("checking");
    setErrorMessage(null);
    try {
      const result = await getBetterGateDesktopMe();
      setUser(result.user);
      setOnboardingDone(isBetterGateOnboardingDone(result.user));
      setAuthState("signedIn");
    } catch {
      clearBetterGateDesktopToken();
      setUser(null);
      setOnboardingDone(false);
      setAuthState("signedOut");
    }
  }, []);

  const handleReplayOnboarding = useCallback(() => {
    resetBetterGateOnboardingState(user);
    setOnboardingDone(false);
    toast.info("已打开新手引导", {
      closeButton: true,
    });
  }, [user]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    const handleSignedOut = () => {
      pollRunRef.current += 1;
      setUser(null);
      setUserCode(null);
      setOnboardingDone(false);
      setErrorMessage(null);
      setAuthState("signedOut");
    };

    window.addEventListener(
      BETTER_GATE_DESKTOP_SIGNED_OUT_EVENT,
      handleSignedOut,
    );

    return () => {
      window.removeEventListener(
        BETTER_GATE_DESKTOP_SIGNED_OUT_EVENT,
        handleSignedOut,
      );
    };
  }, []);

  useEffect(() => {
    if (authState === "signedIn") {
      return;
    }

    void configureLoginWindow().catch((error) => {
      console.error(
        "[BetterGateLoginGate] failed to configure login window",
        error,
      );
    });
  }, [authState]);

  useEffect(() => {
    const handleReplayOnboardingEvent = () => {
      handleReplayOnboarding();
    };

    window.addEventListener(
      REPLAY_ONBOARDING_EVENT,
      handleReplayOnboardingEvent,
    );

    return () => {
      window.removeEventListener(
        REPLAY_ONBOARDING_EVENT,
        handleReplayOnboardingEvent,
      );
    };
  }, [handleReplayOnboarding]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const handleDebugShortcut = (event: KeyboardEvent) => {
      const isReplayShortcut =
        event.key === "F8" ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "o");

      if (!isReplayShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleReplayOnboarding();
    };

    window.addEventListener("keydown", handleDebugShortcut, true);
    document.addEventListener("keydown", handleDebugShortcut, true);

    return () => {
      window.removeEventListener("keydown", handleDebugShortcut, true);
      document.removeEventListener("keydown", handleDebugShortcut, true);
    };
  }, [handleReplayOnboarding]);

  const handleLogin = async () => {
    const currentRun = pollRunRef.current + 1;
    pollRunRef.current = currentRun;
    setAuthState("waiting");
    setUserCode(null);
    setErrorMessage(null);

    try {
      const started = await startBetterGateDesktopLogin(getBetterGateSaasUrl());
      setUserCode(started.userCode);
      await settingsApi.openExternal(started.verificationUri);

      const timeoutAt = Date.now() + started.expiresIn * 1000;
      const intervalMs = Math.max(1, started.interval) * 1000;

      while (Date.now() < timeoutAt && pollRunRef.current === currentRun) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        const result = await pollBetterGateDesktopLogin(
          started.deviceCode,
          getBetterGateSaasUrl(),
        );

        if (result.status === "pending") {
          continue;
        }

        if (result.status === "approved") {
          setBetterGateDesktopToken(result.accessToken);
          setUser(result.user);
          setOnboardingDone(isBetterGateOnboardingDone(result.user));
          setUserCode(null);
          setAuthState("signedIn");
          return;
        }

        throw new Error(`Login ${result.status}`);
      }

      throw new Error("Login expired");
    } catch (error) {
      console.error("[BetterGateLoginGate] login failed", error);
      setAuthState("error");
      setErrorMessage("登录未完成，请在网页中确认授权后重试。");
      toast.error("Better Gate 登录失败", { closeButton: true });
    }
  };

  const handleTermsClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void settingsApi.openExternal(
      "https://better-gate.com/legal-information/terms-conditions",
    );
  };

  if (authState === "signedIn" && user) {
    if (!onboardingDone) {
      return (
        <BetterGateOnboarding
          currentUser={user}
          onComplete={() => {
            setOnboardingDone(true);
          }}
        />
      );
    }

    return children;
  }

  const isBusy = authState === "waiting" || authState === "checking";

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-white text-neutral-950">
      <AuthCloseButton />

      <main className="flex w-full max-w-[330px] flex-col items-center px-2 text-center">
        <img
          src={betterGateIcon}
          alt="Better Gate"
          className="mb-6 h-14 w-14"
          draggable={false}
        />

        <h1 className="text-[22px] font-semibold leading-7 tracking-normal">
          欢迎使用 Better Gate
        </h1>

        <p className="mt-2.5 text-sm leading-6 text-neutral-500">
          连接 AI 模型，从这里开始
        </p>

        <Button
          className="mt-7 h-11 w-full rounded-xl bg-neutral-950 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
          onClick={handleLogin}
          disabled={isBusy}
        >
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {authState === "waiting" ? "等待网页授权" : "登录以继续"}
        </Button>

        {authState === "waiting" ? (
          <div className="mt-4 w-full rounded-xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
            请在浏览器中完成授权
            {userCode ? (
              <span className="font-medium">，授权码 {userCode}</span>
            ) : null}
          </div>
        ) : null}

        {authState === "error" && errorMessage ? (
          <div className="mt-4 w-full rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-5 text-neutral-500">
          登录即表示您同意{" "}
          <a
            className="font-medium text-neutral-800 underline underline-offset-4"
            href="https://better-gate.com/legal-information/terms-conditions"
            onClick={handleTermsClick}
          >
            服务条款
          </a>
        </p>
      </main>
    </div>
  );
}

export function replayBetterGateOnboarding() {
  window.dispatchEvent(new Event(REPLAY_ONBOARDING_EVENT));
}
