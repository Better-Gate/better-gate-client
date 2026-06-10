import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdate } from "@/contexts/UpdateContext";
import { relaunchApp } from "@/lib/updater";

function getReleaseNotes(notes?: string): string[] {
  if (!notes?.trim()) {
    return ["包含稳定性改进和体验优化。"];
  }

  const lines = notes
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/^[-*]\s*/, "")
        .trim(),
    )
    .filter(Boolean)
    .filter((line) => !/^v?\d+\.\d+/.test(line))
    .slice(0, 5)
    .map((line) => (line.length > 96 ? `${line.slice(0, 96)}...` : line));

  return lines.length > 0 ? lines : ["包含稳定性改进和体验优化。"];
}

export function UpdatePromptDialog() {
  const { hasUpdate, updateInfo, updateHandle, isDismissed, dismissUpdate } =
    useUpdate();
  const [open, setOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  const notes = useMemo(
    () => getReleaseNotes(updateInfo?.notes),
    [updateInfo?.notes],
  );

  const progress =
    totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : 0;

  useEffect(() => {
    if (hasUpdate && updateInfo && !isDismissed) {
      setOpen(true);
      setIsInstalled(false);
      setDownloadedBytes(0);
      setTotalBytes(0);
    }
  }, [hasUpdate, isDismissed, updateInfo]);

  const handleDismiss = () => {
    dismissUpdate();
    setOpen(false);
  };

  const handleUpdate = async () => {
    if (isInstalled) {
      try {
        await relaunchApp();
      } catch (error) {
        console.error("重启应用失败", error);
        toast.error("重启失败，请手动重新打开客户端");
      }
      return;
    }

    if (!updateHandle) return;

    setIsUpdating(true);
    setDownloadedBytes(0);
    setTotalBytes(0);

    try {
      let downloaded = 0;
      await updateHandle.downloadAndInstall((event) => {
        if (event.event === "Started") {
          downloaded = 0;
          setTotalBytes(event.total ?? 0);
          setDownloadedBytes(0);
        }

        if (event.event === "Progress") {
          downloaded += event.downloaded ?? 0;
          setDownloadedBytes(downloaded);
        }
      });

      setIsInstalled(true);
      toast.success("更新已安装，重启后生效");
    } catch (error) {
      console.error("安装更新失败", error);
      toast.error("更新失败，请稍后重试");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !isUpdating && setOpen(nextOpen)}
    >
      <DialogContent
        zIndex="top"
        className="w-[380px] overflow-hidden rounded-2xl border-black/10 bg-white p-0 shadow-2xl dark:border-white/10 dark:bg-[#181818]"
        overlayClassName="bg-black/20 backdrop-blur-sm"
      >
        <DialogHeader className="border-b border-black/5 bg-white px-5 py-5 text-left dark:border-white/10 dark:bg-[#181818]">
          <DialogTitle className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            发现新版本
          </DialogTitle>
          <DialogDescription className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span>v{updateInfo?.currentVersion || "-"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>v{updateInfo?.availableVersion || "-"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            更新内容
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-neutral-800 dark:text-neutral-200">
            {notes.map((note, index) => (
              <li key={`${note}-${index}`} className="flex gap-2">
                <span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                <span>{note}</span>
              </li>
            ))}
          </ul>

          {isUpdating ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>正在下载更新</span>
                <span>{totalBytes > 0 ? `${progress}%` : "准备中"}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-950 transition-all dark:bg-neutral-100"
                  style={{ width: totalBytes > 0 ? `${progress}%` : "18%" }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-black/5 bg-neutral-50 px-5 py-4 dark:border-white/10 dark:bg-[#202020]">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-lg px-4 text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            disabled={isUpdating}
            onClick={handleDismiss}
          >
            稍后
          </Button>
          <Button
            type="button"
            className="h-9 rounded-lg bg-neutral-950 px-4 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
            disabled={isUpdating || !updateHandle}
            onClick={handleUpdate}
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                更新中
              </>
            ) : isInstalled ? (
              <>
                <RotateCcw className="h-4 w-4" />
                重启应用
              </>
            ) : (
              "立即更新"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
