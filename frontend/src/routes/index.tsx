import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { ApplicationDetailPage } from '@/pages/ApplicationDetailPage'
import { ApplicationPreparationPage } from '@/pages/ApplicationPreparationPage'
import { ApplicationPreparationsPage } from '@/pages/ApplicationPreparationsPage'
import { ApplicationReviewPage } from '@/pages/ApplicationReviewPage'
import { AutomationPage } from '@/pages/AutomationPage'
import { ApplicationsPage } from '@/pages/ApplicationsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { JobImportPage } from '@/pages/JobImportPage'
import { JobsPage } from '@/pages/JobsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NaukriWorkflowPage } from '@/pages/NaukriWorkflowPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PreferencesPage } from '@/pages/PreferencesPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ResumePage } from '@/pages/ResumePage'
import { ResumesPage } from '@/pages/ResumesPage'
import { ResumeReviewPage } from '@/pages/ResumeReviewPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/jobs', element: <JobsPage /> },
      { path: '/jobs/import', element: <JobImportPage /> },
      { path: '/jobs/:id', element: <JobDetailPage /> },
      { path: '/applications', element: <ApplicationsPage /> },
      { path: '/applications/review/:id', element: <ApplicationReviewPage /> },
      { path: '/applications/:id', element: <ApplicationDetailPage /> },
      { path: '/application-preparations/:id', element: <ApplicationPreparationPage /> },
      { path: '/application-preparations', element: <ApplicationPreparationsPage /> },
      { path: '/naukri/workflow/:jobId', element: <NaukriWorkflowPage /> },
      { path: '/automation/:id', element: <AutomationPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/profile/resume', element: <ResumePage /> },
      { path: '/resumes', element: <ResumesPage /> },
      { path: '/resumes/:id/analysis', element: <ResumeReviewPage /> },
      { path: '/profile/preferences', element: <PreferencesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
