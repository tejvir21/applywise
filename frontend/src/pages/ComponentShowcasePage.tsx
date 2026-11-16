import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardInteractive,
  CardListItem,
  CardMetric,
  CardSection,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, InputSm, Radio, SearchInput, Select, Switch, Textarea } from '@/components/ui/input'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Banner, ErrorState } from '@/components/Feedback'
import { MetricSkeleton, CardSkeleton } from '@/components/Skeleton'
import { Pagination } from '@/components/Pagination'
import { ApplicationStatusBadge } from '@/components/ApplicationStatusBadge'
import { useTheme } from '@/hooks/useTheme'
import {
  ArrowRight,
  Briefcase,
  Download,
  FileText,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Upload,
  User,
} from 'lucide-react'

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      {children}
    </section>
  )
}

export function ComponentShowcasePage() {
  const { theme, setTheme } = useTheme()
  const [page, setPage] = useState(1)

  return (
    <div className="space-y-10">
      <PageHeader
        title="Component Showcase"
        description="Linear-inspired dark / Apple-inspired light. Distinct compositions across components."
        eyebrow="DESIGN SYSTEM"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1">
            <Button
              variant={theme === 'light' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('system')}
            >
              System
            </Button>
          </div>
        }
      />

      <Section title="Buttons" description="Tight, precise controls with distinct treatments">
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <CardDescription>Primary, secondary, outline, ghost, subtle, destructive, and link</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sizes</CardTitle>
            <CardDescription>Compact heights with refined padding</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="xl">Extra large</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Icons & States</CardTitle>
            <CardDescription>Icon buttons, loading, disabled, and combinations</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button>
              <Plus className="h-3.5 w-3.5" />
              Create
            </Button>
            <Button variant="secondary">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button variant="outline">
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button size="icon" variant="secondary" aria-label="Settings">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Search">
              <Search className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-lg" variant="outline" aria-label="Upload">
              <Upload className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Badges & Statuses" description="Tight, bordered labels">
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <CardDescription>Distinct treatments without excess color</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="subtle">Subtle</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="solid">Solid</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Application Status</CardTitle>
            <CardDescription>Real component used across the app</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status="applied" />
            <ApplicationStatusBadge status="interviewing" />
            <ApplicationStatusBadge status="offer" />
            <ApplicationStatusBadge status="rejected" />
            <ApplicationStatusBadge status="withdrawn" />
            <ApplicationStatusBadge status="saved" />
          </CardContent>
        </Card>
      </Section>

      <Section title="Inputs & Forms" description="Refined controls with precise focus states">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Text Inputs</CardTitle>
              <CardDescription>Default and compact sizes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Full name" htmlFor="name">
                <Input id="name" placeholder="Enter your full name" />
              </Field>
              <Field label="Email" htmlFor="email" hint="We'll never share your email">
                <Input id="email" type="email" placeholder="you@example.com" />
              </Field>
              <Field label="Company" htmlFor="company" error="This field is required">
                <Input id="company" placeholder="Acme Inc." />
              </Field>
              <Field label="Role" htmlFor="role">
                <InputSm id="role" placeholder="Compact input" />
              </Field>
              <SearchInput leading={<Search className="h-3.5 w-3.5" />} placeholder="Search jobs..." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Select, Textarea & File</CardTitle>
              <CardDescription>Custom dropdown styling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Experience level" htmlFor="exp">
                <Select id="exp">
                  <option>Entry level</option>
                  <option>Mid level</option>
                  <option>Senior level</option>
                  <option>Lead/Principal</option>
                </Select>
              </Field>
              <Field label="Cover letter notes" htmlFor="notes" hint="Optional">
                <Textarea id="notes" placeholder="Add context for this application..." />
              </Field>
              <Field label="Resume upload" htmlFor="resume">
                <Input id="resume" type="file" />
              </Field>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Selection Controls</CardTitle>
            <CardDescription>Checkboxes, radios, and switches</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Checkbox label="Email notifications" description="Get updates about applications" />
            <Checkbox label="Job alerts" description="Weekly digest of matches" defaultChecked />
            <Checkbox label="Marketing emails" description="Product updates and tips" disabled />
            <Radio name="mode" label="Manual review" description="Review each match yourself" />
            <Radio name="mode" label="Auto-apply" description="Apply to high-match roles" />
            <Radio name="mode" label="Smart queue" description="Curated by AI" disabled />
            <Switch label="Dark mode" description="Use dark theme across the app" />
            <Switch label="Two-factor auth" description="Add an extra layer of security" defaultChecked />
            <Switch label="Public profile" description="Visible to recruiters" disabled />
          </CardContent>
        </Card>
      </Section>

      <Section title="Cards" description="Distinct compositions for different contexts">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Standard Card</CardTitle>
              <CardDescription>Default content card</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                Clean, structured layout for forms, settings, and general content.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
              <Button size="sm">Save changes</Button>
            </CardFooter>
          </Card>
          <CardInteractive>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Interactive Card</CardTitle>
                <Badge variant="accent">New</Badge>
              </div>
              <CardDescription>Subtle hover with border transition</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                Great for job cards, application cards, and list items that are clickable.
              </p>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="text-xs text-[var(--text-tertiary)]">Updated 2h ago</span>
              <Button variant="ghost" size="sm">
                View details
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardFooter>
          </CardInteractive>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <CardMetric>
            <p className="text-sm text-[var(--text-secondary)]">Applications</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">24</p>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">+3 this week</p>
          </CardMetric>
          <CardMetric>
            <p className="text-sm text-[var(--text-secondary)]">Interviews</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">6</p>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">2 upcoming</p>
          </CardMetric>
          <CardMetric>
            <p className="text-sm text-[var(--text-secondary)]">Response Rate</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">42%</p>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">+8% vs last month</p>
          </CardMetric>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>List Card</CardTitle>
            <CardDescription>Compact rows with hover states</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <CardListItem>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-tertiary)]">
                  <Briefcase className="h-4 w-4 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Senior Frontend Engineer</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Acme Inc. • Remote</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="accent">Interviewing</Badge>
                <Button variant="ghost" size="sm">
                  View
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardListItem>
            <CardListItem>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-tertiary)]">
                  <Briefcase className="h-4 w-4 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Product Designer</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Studio Co. • New York</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Applied</Badge>
                <Button variant="ghost" size="sm">
                  View
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardListItem>
          </CardContent>
          <CardSection className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">3 more applications</span>
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardSection>
        </Card>
      </Section>

      <Section title="Feedback & States" description="Alerts, empty states, loading">
        <div className="space-y-3">
          <Banner tone="info" title="New feature available">
            AI-powered resume matching is now live.
          </Banner>
          <Banner tone="success" title="Resume uploaded successfully">
            Your resume has been parsed and is ready for analysis.
          </Banner>
          <Banner tone="warning" title="Profile incomplete">
            Complete your profile to get better job matches.
          </Banner>
          <Banner tone="error" title="Connection failed">
            Unable to reach the server.
          </Banner>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyState
            title="No applications yet"
            description="Start by finding jobs that match your skills and add them to your pipeline."
            icon={<FileText className="h-4 w-4" />}
            action={
              <Button>
                <Search className="h-3.5 w-3.5" />
                Browse jobs
              </Button>
            }
          />
          <ErrorState
            title="Something went wrong"
            description="We couldn't load your applications. Please try again."
            onRetry={() => {}}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Loading Skeletons</CardTitle>
            <CardDescription>Subtle placeholders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
            <CardSkeleton />
          </CardContent>
        </Card>
      </Section>

      <Section title="Navigation & Pagination" description="Lists and pagination">
        <Card>
          <CardHeader>
            <CardTitle>Pagination</CardTitle>
            <CardDescription>Accessible pagination</CardDescription>
          </CardHeader>
          <CardContent>
            <Pagination
              page={page}
              totalPages={5}
              total={48}
              pageSize={10}
              shownCount={10}
              onPageChange={setPage}
              itemLabel="applications"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Workflow shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="secondary" className="w-full justify-start">
              <Upload className="h-3.5 w-3.5" />
              Upload resume
            </Button>
            <Button variant="secondary" className="w-full justify-start">
              <Search className="h-3.5 w-3.5" />
              Discover jobs
            </Button>
            <Button variant="secondary" className="w-full justify-start">
              <FileText className="h-3.5 w-3.5" />
              Review applications
            </Button>
            <Button variant="secondary" className="w-full justify-start">
              <User className="h-3.5 w-3.5" />
              Update profile
            </Button>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
