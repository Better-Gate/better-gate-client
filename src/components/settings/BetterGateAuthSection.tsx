import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { settingsApi } from "@/lib/api";
import {
  clearBetterGateDesktopToken,
  getBetterGateDesktopMe,
  getBetterGateSaasUrl,
  pollBetterGateDesktopLogin,
  setBetterGateDesktopToken,
  startBetterGateDesktopLogin,
  type BetterGateDesktopUser,
} from "@/lib/api/betterGateDesktop";

type LoginState = "idle" | "checking" | "waiting" | "authenticated" | "error";

function getInitial(name?: string | null, email?: string | null) {
  return (name || email || "B").trim().slice(0, 1).toUpperCase();
}

export function BetterGateAuthSection() {
  const pollRunRef = useRef(0);
  const [state, setState] = useState<LoginState>("checking");
  const [user, setUser] = useState<BetterGateDesktopUser | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setState("checking");
    try {
      const result = await getBetterGateDesktopMe();
      setUser(result.user);
      setState("authenticated");
    } catch {
      clearBetterGateDesktopToken();
      setUser(null);
      setState("idle");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const handleLogin = async () => {
    const currentRun = pollRunRef.current + 1;
    pollRunRef.current = currentRun;
    setState("waiting");
    setUserCode(null);

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
          setState("authenticated");
          setUserCode(null);
          return;
        }

        throw new Error(`Login ${result.status}`);
      }

      throw new Error("Login expired");
    } catch (error) {
      console.error("[BetterGateAuthSection] login failed", error);
      setState("error");
      toast.error("登录失败，请重新尝试", { closeButton: true });
    }
  };

  const handleLogout = () => {
    pollRunRef.current += 1;
    clearBetterGateDesktopToken();
    setUser(null);
    setUserCode(null);
    setState("idle");
    toast.success("已退出登录", { closeButton: true });
  };

  const isBusy = state === "checking" || state === "waiting";

  return (
    <div className="space-y-2">
      <div className="flex h-[60px] items-center gap-3 rounded-xl px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-700">
          {user ? getInitial(user.name, user.email) : "B"}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-950">
            {user ? user.name || user.email : "Better Gate 账号"}
          </div>
          <div className="mt-0.5 truncate text-xs text-neutral-400">
            {user
              ? user.email
              : state === "waiting"
                ? "请在浏览器中完成登录"
                : "登录后同步工作区、API Key 和用量"}
          </div>
        </div>

        {user ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 rounded-lg px-2 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            退出
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleLogin}
            disabled={isBusy}
            className="h-8 rounded-lg bg-neutral-950 px-3 text-xs text-white hover:bg-neutral-800"
          >
            {isBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            )}
            登录
          </Button>
        )}
      </div>

      {state === "waiting" ? (
        <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-500">
          授权码：{userCode ?? "--"}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
          登录没有完成，请重新点击登录。
        </div>
      ) : null}
    </div>
  );
}
