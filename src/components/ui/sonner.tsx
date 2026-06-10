import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme-provider";
import type { CSSProperties } from "react";

export function Toaster() {
  const { theme } = useTheme();

  // 将应用主题映射到 Sonner 的主题
  // 如果是 "system"，Sonner 会自己处理
  const sonnerTheme = theme === "system" ? "system" : theme;

  return (
    <SonnerToaster
      position="top-center"
      theme={sonnerTheme}
      visibleToasts={3}
      offset={{ top: 52 }}
      style={
        {
          "--width": "320px",
          "--border-radius": "12px",
        } as CSSProperties
      }
      toastOptions={{
        duration: 2400,
        classNames: {
          toast:
            "group min-h-0 !w-[320px] !rounded-xl !border !border-neutral-200/80 !bg-white/95 px-3.5 py-3 !text-neutral-950 !shadow-[0_16px_38px_rgba(15,23,42,0.14)] backdrop-blur dark:!border-neutral-800 dark:!bg-neutral-900/95 dark:!text-neutral-50 data-[type=success]:!border-emerald-200/80 data-[type=error]:!border-red-200/80 data-[type=warning]:!border-amber-200/80 dark:data-[type=success]:!border-emerald-900/70 dark:data-[type=error]:!border-red-900/70 dark:data-[type=warning]:!border-amber-900/70",
          title: "text-[13px] font-medium leading-5 tracking-normal",
          description:
            "mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400",
          icon:
            "text-neutral-500 dark:text-neutral-400 group-data-[type=success]:text-emerald-500 group-data-[type=error]:text-red-500 group-data-[type=warning]:text-amber-500",
          closeButton:
            "absolute right-2 top-2 rounded-full border-0 bg-transparent p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200",
          actionButton:
            "rounded-lg bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200",
          cancelButton:
            "rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700",
        },
      }}
    />
  );
}
