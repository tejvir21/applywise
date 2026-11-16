import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function ConceptA() {
  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#e6e6e9] rounded-lg overflow-hidden">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0b0b0f]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-[#8b5cf6] to-[#6366f1]" />
            <span className="text-sm font-medium">ApplyWise</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <span className="text-white">Dashboard</span>
            <span className="text-[#a1a1aa]">Jobs</span>
            <span className="text-[#a1a1aa]">Applications</span>
            <span className="text-[#a1a1aa]">Resumes</span>
          </nav>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-white text-black hover:bg-white/90">New Application</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-[#a1a1aa]">Track your job search with precision</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/5 bg-[#131316] shadow-none">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa]">Applications</CardDescription>
              <CardTitle className="text-3xl">24</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#a1a1aa]">+3 this week</p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-[#131316] shadow-none">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa]">Interviews</CardDescription>
              <CardTitle className="text-3xl">6</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#a1a1aa]">2 upcoming</p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-[#131316] shadow-none">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa]">Response Rate</CardDescription>
              <CardTitle className="text-3xl">42%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#a1a1aa]">+8% vs last month</p>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-6 border-white/5 bg-[#131316] shadow-none">
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription className="text-[#a1a1aa]">Your latest activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 px-4 py-3 hover:bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white/5" />
                  <div>
                    <p className="text-sm font-medium">Senior Frontend Engineer</p>
                    <p className="text-xs text-[#a1a1aa]">Acme Inc.</p>
                  </div>
                </div>
                <Badge className="bg-[#8b5cf6]/10 text-[#a78bfa]">Interviewing</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function ConceptB() {
  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] rounded-lg overflow-hidden">
      <header className="border-b border-[#e5e5e7]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold">ApplyWise</span>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <span>Jobs</span>
            <span>Applications</span>
            <span>Resumes</span>
            <span>Settings</span>
          </nav>
          <Button size="sm" variant="outline" className="rounded-full">Sign in</Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Your career, organized.</h1>
          <p className="mt-3 text-lg text-[#86868b]">A refined workspace for job applications</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl border-[#e5e5e7] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <CardHeader>
              <CardTitle className="text-xl">Applications</CardTitle>
              <CardDescription className="text-[#86868b]">Track every opportunity</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-5xl font-semibold tracking-tight">24</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-[#e5e5e7] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <CardHeader>
              <CardTitle className="text-xl">Interviews</CardTitle>
              <CardDescription className="text-[#86868b]">Upcoming conversations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-5xl font-semibold tracking-tight">6</p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <Button className="rounded-full bg-[#1d1d1f] text-white hover:bg-[#1d1d1f]/90">Get Started</Button>
          <Button variant="outline" className="rounded-full border-[#d2d2d7]">Learn More</Button>
        </div>
      </main>
    </div>
  )
}

function ConceptC() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#171717] rounded-lg overflow-hidden">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm font-medium">ApplyWise</span>
            <Button size="sm" variant="ghost">Sign in</Button>
          </div>
          <h1 className="text-5xl font-serif tracking-tight">Job Search Journal</h1>
          <p className="mt-4 text-lg text-[#737373]">A considered approach to your career transition</p>
        </header>
        <div className="space-y-4">
          <Card className="rounded-none border-[#e5e5e5] bg-white shadow-none">
            <CardHeader className="border-b border-[#f5f5f5]">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-xl">Senior Frontend Engineer</CardTitle>
                <Badge variant="outline" className="rounded-none">Interviewing</Badge>
              </div>
              <CardDescription>Acme Inc. • Remote</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed text-[#525252]">
                Applied 3 days ago. Next interview scheduled for Friday.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-none border-[#e5e5e5] bg-white shadow-none">
            <CardHeader className="border-b border-[#f5f5f5]">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-xl">Product Designer</CardTitle>
                <Badge variant="outline" className="rounded-none">Applied</Badge>
              </div>
              <CardDescription>Studio Co. • New York</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed text-[#525252]">
                Cover letter submitted. Awaiting response.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function DesignConceptsPage() {
  const [concept, setConcept] = useState<'a' | 'b' | 'c'>('a')
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Design Direction Proposals</h1>
            <p className="text-sm text-muted-foreground">Three distinct concepts for ApplyWise</p>
          </div>
          <div className="flex gap-2">
            <Button variant={concept === 'a' ? 'default' : 'outline'} size="sm" onClick={() => setConcept('a')}>A. Linear-inspired</Button>
            <Button variant={concept === 'b' ? 'default' : 'outline'} size="sm" onClick={() => setConcept('b')}>B. Apple-inspired</Button>
            <Button variant={concept === 'c' ? 'default' : 'outline'} size="sm" onClick={() => setConcept('c')}>C. Editorial Minimal</Button>
          </div>
        </div>
      </div>
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {concept === 'a' && (
            <div>
              <h2 className="mb-2 text-xl font-semibold">A. Refined Linear-inspired Workspace</h2>
              <p className="mb-6 text-muted-foreground">Dark, precise, keyboard-first. Focused on density and speed.</p>
              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <Card>
                  <CardHeader><CardTitle>Typography</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>Headings:</strong> Inter, 600 weight</p>
                    <p><strong>Body:</strong> Inter, 400-500 weight</p>
                    <p><strong>Scale:</strong> Tight tracking, compact</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Palette</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>BG:</strong> #0b0b0f (near black)</p>
                    <p><strong>Surface:</strong> #131316</p>
                    <p><strong>Accent:</strong> #8b5cf6 (violet)</p>
                    <p><strong>Text:</strong> #e6e6e9 / #a1a1aa</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          {concept === 'b' && (
            <div>
              <h2 className="mb-2 text-xl font-semibold">B. Premium Apple-inspired SaaS Interface</h2>
              <p className="mb-6 text-muted-foreground">Light, airy, generous whitespace. Elegant and approachable.</p>
              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <Card>
                  <CardHeader><CardTitle>Typography</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>Headings:</strong> SF Pro Display / Inter, 600 weight</p>
                    <p><strong>Body:</strong> SF Pro Text / Inter, 400-500 weight</p>
                    <p><strong>Scale:</strong> Generous, refined</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Palette</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>BG:</strong> #ffffff</p>
                    <p><strong>Surface:</strong> #ffffff</p>
                    <p><strong>Accent:</strong> #1d1d1f (near black)</p>
                    <p><strong>Text:</strong> #1d1d1f / #86868b</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          {concept === 'c' && (
            <div>
              <h2 className="mb-2 text-xl font-semibold">C. Editorial, Minimal, High-end Professional</h2>
              <p className="mb-6 text-muted-foreground">Warm, considered, typography-forward. Distinctive and sophisticated.</p>
              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <Card>
                  <CardHeader><CardTitle>Typography</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>Headings:</strong> Serif (Georgia/Times), 600 weight</p>
                    <p><strong>Body:</strong> Inter, 400-500 weight</p>
                    <p><strong>Scale:</strong> Editorial, generous line height</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Palette</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>BG:</strong> #fafafa</p>
                    <p><strong>Surface:</strong> #ffffff</p>
                    <p><strong>Accent:</strong> #171717</p>
                    <p><strong>Text:</strong> #171717 / #737373</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {concept === 'a' && <ConceptA />}
        {concept === 'b' && <ConceptB />}
        {concept === 'c' && <ConceptC />}
      </div>
    </div>
  )
}
