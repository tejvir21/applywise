import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHealth } from "@/hooks/useHealth";
import { usePlatforms } from "@/hooks/usePlatforms";
import {
  getSubmissionSettings,
  updateSubmissionSettings,
} from "@/services/platforms";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import {
  Moon,
  Sun,
  Monitor,
  Settings2,
  Shield,
  Briefcase,
  UserRound,
} from "lucide-react";

type PlatformRow = { platform: string; mode: string; authorized: boolean };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const health = useHealth();
  const platformsQuery = usePlatforms();
  const { theme, setTheme } = useTheme();
  const settingsQuery = useQuery({
    queryKey: ["submission-settings"],
    queryFn: getSubmissionSettings,
    retry: 1,
  });

  const [paused, setPaused] = useState<boolean | null>(null);
  const [dailyLimit, setDailyLimit] = useState("");
  const [minScore, setMinScore] = useState("");
  const [rows, setRows] = useState<PlatformRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const settings = settingsQuery.data ?? null;
  const snapshot = settings ? JSON.stringify(settings) : null;
  const [synced, setSynced] = useState<string | null>(null);
  if (snapshot && snapshot !== synced) {
    setSynced(snapshot);
    setPaused(settings!.globalPaused);
    setDailyLimit(settings!.dailyLimit.toString());
    setMinScore(settings!.minMatchScore.toString());
    setRows(settings!.platforms.map((p) => ({ ...p })));
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const limit = dailyLimit.trim() === "" ? undefined : Number(dailyLimit);
    const score = minScore.trim() === "" ? undefined : Number(minScore);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      setError("Daily limit must be a whole number between 1 and 100.");
      return;
    }
    if (
      score !== undefined &&
      (!Number.isInteger(score) || score < 0 || score > 100)
    ) {
      setError("Minimum match score must be a whole number between 0 and 100.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await updateSubmissionSettings({
        globalPaused: paused ?? undefined,
        dailyLimit: limit,
        minMatchScore: score,
        platforms: (rows ?? []).map((r) => ({
          platform: r.platform,
          mode: r.mode as "auto" | "permission" | "disabled",
          authorized: r.authorized,
        })),
      });
      setNotice("Settings saved successfully.");
      await queryClient.invalidateQueries({
        queryKey: ["submission-settings"],
      });
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function setRowMode(platform: string, mode: string) {
    setRows((prev) => {
      const list = prev ?? [];
      if (list.some((r) => r.platform === platform)) {
        return list.map((r) => (r.platform === platform ? { ...r, mode } : r));
      }
      return [...list, { platform, mode, authorized: false }];
    });
  }

  function setRowAuthorized(platform: string, authorized: boolean) {
    setRows((prev) => {
      const list = prev ?? [];
      if (list.some((r) => r.platform === platform)) {
        return list.map((r) =>
          r.platform === platform ? { ...r, authorized } : r,
        );
      }
      return [...list, { platform, mode: "permission", authorized }];
    });
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your preferences, automation controls, and account configuration."
        eyebrow="SETTINGS"
      />

      {settingsQuery.isPending && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading settings…
        </div>
      )}
      {settingsQuery.isError && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Could not load settings
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => settingsQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!settingsQuery.isPending && !settingsQuery.isError && (
        <form onSubmit={(e) => void onSave(e)} className="space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-primary)]"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-primary)]"
            >
              {notice}
            </div>
          )}

          {/* Account */}

          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
              <UserRound className="h-4 w-4 text-[var(--text-tertiary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Account
              </h2>
            </div>
            <CardContent className="space-y-4 sm:px-6 sm:py-5">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Account settings are managed through your session.
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Sign-in uses secure sessions.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}

          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
              <Moon className="h-4 w-4 text-[var(--text-tertiary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Appearance
              </h2>
            </div>
            <CardContent className="px-6 sm:py-5">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Theme
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Choose your preferred color scheme
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
                          isActive
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-sm)]"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Automated submissions */}

          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
              <Settings2 className="h-4 w-4 text-[var(--text-tertiary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Automated submissions
              </h2>
            </div>
            <CardContent className="space-y-4 px-6 sm:py-5">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={paused ?? false}
                  onChange={(e) => setPaused(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--ring)]"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Global pause
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Stop all new automated submissions immediately
                  </p>
                </div>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Maximum applications per day
                  </span>
                  <input
                    aria-label="Maximum applications per day"
                    type="number"
                    min={1}
                    max={100}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Minimum match score for automatic submission
                  </span>
                  <input
                    aria-label="Minimum match score"
                    type="number"
                    min={0}
                    max={100}
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </label>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                These are guardrails for future integrations. No automatic
                submission path exists for any platform today.
              </p>
            </CardContent>
          </Card>

          {/* Platforms */}
          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
              <Briefcase className="h-4 w-4 text-[var(--text-tertiary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Platforms
              </h2>
            </div>
            <CardContent className="px-6 sm:py-5">
              {platformsQuery.isPending && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Loading platforms…
                </p>
              )}
              {platformsQuery.data && (
                <div className="space-y-2">
                  {platformsQuery.data.map((platform) => {
                    const row = rows?.find(
                      (r) => r.platform === platform.platform,
                    );
                    return (
                      <div
                        key={platform.platform}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {platform.displayName}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            Apply: {platform.capabilities.submit.status}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <span>Mode</span>
                            <select
                              aria-label={`Mode for ${platform.displayName}`}
                              value={row?.mode ?? "permission"}
                              onChange={(e) =>
                                setRowMode(platform.platform, e.target.value)
                              }
                              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text-primary)]"
                            >
                              <option value="auto">Auto</option>
                              <option value="permission">Permission</option>
                              <option value="disabled">Disabled</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                            <input
                              type="checkbox"
                              checked={row?.authorized ?? false}
                              onChange={(e) =>
                                setRowAuthorized(
                                  platform.platform,
                                  e.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-[var(--border-strong)]"
                            />
                            <span>Authorized</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => settingsQuery.refetch()}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Privacy & Security */}

      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <Shield className="h-4 w-4 text-[var(--text-tertiary)]" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Privacy & Security
          </h2>
        </div>
        <CardContent className="space-y-3 px-6 sm:py-5 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
            <div>
              <p className="font-medium text-[var(--text-primary)]">
                AI provider
              </p>
              <p className="text-[var(--text-secondary)]">
                Server configuration
              </p>
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">
              {health.data?.ai_provider ?? "Loading…"}
            </span>
          </div>
          <div className="rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="font-medium text-[var(--text-primary)]">
              Data export
            </p>
            <p className="mt-1 text-[var(--text-secondary)]">
              Data export is not available yet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
