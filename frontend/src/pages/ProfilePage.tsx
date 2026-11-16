import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useProfile";
import {
  addProfileSkill,
  createProfile,
  removeProfileSkill,
  updateProfile,
  type CandidateProfile,
} from "@/services/profile";
import { ProfileReadiness } from "@/components/ProfileReadiness";
import {
  UserRound,
  Mail,
  MapPin,
  FileText,
  CircleCheckBig,
  Loader,
} from "lucide-react";

const TEXT_FIELDS: Array<{
  key: keyof CandidateProfile;
  label: string;
  required?: boolean;
  type?: string;
}> = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "displayName", label: "Display name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "headline", label: "Professional headline" },
  { key: "currentJobTitle", label: "Current job title" },
  { key: "currentCompany", label: "Current company" },
];

export function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const [form, setForm] = useState<Record<string, string>>({});
  const [years, setYears] = useState("");
  const [summary, setSummary] = useState("");
  const [skillName, setSkillName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const profile = profileQuery.data ?? null;
  const formKey = profile
    ? JSON.stringify([
        profile.firstName,
        profile.lastName,
        profile.skills?.length,
        profile.yearsOfExperience ?? null,
      ])
    : "new";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (formKey !== syncedKey) {
    setSyncedKey(formKey);
    const next: Record<string, string> = {};
    for (const field of TEXT_FIELDS) {
      const value = (profile as any)?.[field.key];
      next[field.key] = typeof value === "string" ? value : "";
    }
    setForm(next);
    setYears(profile?.yearsOfExperience?.toString() ?? "");
    setSummary(profile?.professionalSummary ?? "");
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    await queryClient.invalidateQueries({ queryKey: ["profile-completion"] });
    await queryClient.invalidateQueries({ queryKey: ["profile-readiness"] });
    await queryClient.invalidateQueries({ queryKey: ["job-profile-readiness"] });
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      setError("First name and last name are required.");
      return;
    }
    const yearsNum = years.trim() === "" ? undefined : Number(years);
    if (
      yearsNum !== undefined &&
      (!Number.isInteger(yearsNum) || yearsNum < 0 || yearsNum > 50)
    ) {
      setError("Years of experience must be a whole number between 0 and 50.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        ...form,
        professionalSummary: summary || undefined,
      };
      if (yearsNum !== undefined) body.yearsOfExperience = yearsNum;
      if (profile) {
        await updateProfile(body);
        setNotice("Profile saved.");
      } else {
        await createProfile(body);
        setNotice("Profile created.");
      }
      await refresh();
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddSkill() {
    const name = skillName.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    try {
      await addProfileSkill({ name });
      setSkillName("");
      setNotice("Skill added.");
      await refresh();
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add skill");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveSkill(skillId?: string) {
    if (!skillId) return;
    setError(null);
    setBusy(true);
    try {
      await removeProfileSkill(skillId);
      setNotice("Skill removed.");
      await refresh();
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove skill");
    } finally {
      setBusy(false);
    }
  }

  const skills = profile?.skills || [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Your Profile"
        description="Build a complete, accurate profile to improve job matching and recommendations."
        eyebrow="PROFILE"
      />
      <ProfileReadiness />

      {profile && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex items-start gap-4 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-subtle)] text-[var(--accent)]">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {profile.firstName + " " + profile.lastName}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {profile.headline ||
                  profile.currentJobTitle ||
                  "Add a headline or job title"}
              </p>
              {(profile.email || profile.location) && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-tertiary)]">
                  {profile.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {profile.email}
                    </span>
                  )}
                  {profile.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {profile.location}
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {profileQuery.isPending && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Loading profile
          <Loader />
        </div>
      )}
      {profileQuery.isError && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Could not load profile
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => profileQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!profileQuery.isPending && !profileQuery.isError && (
        <>
          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <CardContent className="flex flex-col gap-3 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-[var(--text-tertiary)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Resumes
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Upload and manage your resumes on the{" "}
                    <Link
                      className="text-[var(--text-primary)] underline underline-offset-2"
                      to="/resumes"
                    >
                      Resumes page
                    </Link>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {(error || notice) && (
            <div className="space-y-2">
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
            </div>
          )}

          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border-subtle)] px-6 py-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Personal information
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Basic details used for identification and contact
              </p>
            </div>
            <CardContent className="sm:p-6">
              <form onSubmit={(e) => void onSave(e)} className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {TEXT_FIELDS.filter((f) =>
                    [
                      "firstName",
                      "lastName",
                      "displayName",
                      "email",
                      "phone",
                      "location",
                      "city",
                      "state",
                      "country",
                    ].includes(f.key as string),
                  ).map((field) => (
                    <label key={field.key as string} className="space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <Input
                        type={(field as any).type ?? "text"}
                        required={(field as any).required}
                        value={(form as any)[field.key] ?? ""}
                        onChange={(e) =>
                          setForm((prev: any) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="h-9"
                      />
                    </label>
                  ))}
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-6">
                  <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
                    Professional information
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {TEXT_FIELDS.filter((f) =>
                      [
                        "headline",
                        "currentJobTitle",
                        "currentCompany",
                      ].includes(f.key as string),
                    ).map((field) => (
                      <label key={field.key as string} className="space-y-1.5">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {field.label}
                        </span>
                        <Input
                          type={(field as any).type ?? "text"}
                          value={(form as any)[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((prev: any) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </label>
                    ))}
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        Years of experience
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={years}
                        onChange={(e) => setYears(e.target.value)}
                        className="h-9"
                      />
                    </label>
                  </div>
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-6">
                  <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
                    Professional summary
                  </h3>
                  <textarea
                    aria-label="Professional summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={4}
                    placeholder="Brief overview..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? "Saving..."
                      : profile
                        ? "Save changes"
                        : "Create profile"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => profileQuery.refetch()}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border-subtle)] px-6 py-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Skills
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Add skills relevant to your target roles
              </p>
            </div>
            <CardContent className="space-y-4 sm:p-6">
              {skills.length === 0 ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  No skills added yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill: any) => (
                    <span
                      key={skill._id || skill.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm text-[var(--text-primary)]"
                    >
                      {skill.name}
                      {skill.level && (
                        <span className="text-[var(--text-tertiary)]">
                          ({skill.level})
                        </span>
                      )}
                      {skill._id && (
                        <button
                          type="button"
                          aria-label={"Remove " + skill.name}
                          disabled={busy}
                          onClick={() => void onRemoveSkill(skill._id)}
                          className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          <CircleCheckBig className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  aria-label="New skill name"
                  placeholder="e.g., React, TypeScript"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="h-9 max-w-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !skillName.trim()}
                  onClick={() => void onAddSkill()}
                >
                  Add skill
                </Button>
              </div>
            </CardContent>
          </Card>

          {!profile && (
            <EmptyState
              title="No profile yet"
              description="Complete the form above to create your profile."
            />
          )}
        </>
      )}
    </div>
  );
}
