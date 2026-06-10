import { KeyRound } from "lucide-react";
import type { SettingsFormState } from "@/hooks/useSettings";
import { ToggleRow } from "@/components/ui/toggle-row";

interface CodexAuthSettingsProps {
  settings: SettingsFormState;
  onChange: (updates: Partial<SettingsFormState>) => void;
}

export function CodexAuthSettings({
  settings,
  onChange,
}: CodexAuthSettingsProps) {
  return (
    <section>
      <ToggleRow
        icon={<KeyRound className="h-4 w-4 text-emerald-500" />}
        title="保留 Codex 官方登录"
        description="开启后，接入 Better Gate 时仍可使用 Codex 官方账号相关能力，例如插件和远程操作。切换配置后请重启 Codex 客户端。"
        checked={settings.preserveCodexOfficialAuthOnSwitch ?? false}
        onCheckedChange={(value) =>
          onChange({ preserveCodexOfficialAuthOnSwitch: value })
        }
      />
    </section>
  );
}
