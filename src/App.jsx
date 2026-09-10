import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster as SonnerToaster } from 'sonner';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import Onboard from '@/pages/Onboard';
import ClubHome from '@/pages/ClubHome';
import EventsList from '@/pages/EventsList';
import EventNew from '@/pages/EventNew';
import EventDetail from '@/pages/EventDetail';
import EventScan from '@/pages/EventScan';
import EventAcquittal from '@/pages/EventAcquittal';
import Committee from '@/pages/Committee';
import ClubSettings from '@/pages/ClubSettings';
import AcquittalPacks from '@/pages/AcquittalPacks';
import Analytics from '@/pages/Analytics';
import Account from '@/pages/Account';
import PublicRSVP from '@/pages/PublicRSVP';
import PublicClub from '@/pages/PublicClub';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import AppShell from '@/components/AppShell';

import Login from '@/pages/auth/Login';
import Signup from '@/pages/auth/Signup';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';

function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-[3px] border-border border-t-primary rounded-full animate-spin" />
    </div>
  );
}

/** Gate for the committee app. Remembers where you were headed. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/** Keeps signed-in users away from the sign-in screens. */
function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/rsvp/:eventId" element={<PublicRSVP />} />
      <Route path="/p/:clubSlug" element={<PublicClub />} />

      {/* Authentication */}
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
      {/* Verification finishes a signup, so it must stay reachable mid-flow. */}
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Committee app */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/account" element={<Account />} />
        <Route path="/c/:clubSlug" element={<ClubHome />} />
        <Route path="/c/:clubSlug/events" element={<EventsList />} />
        <Route path="/c/:clubSlug/events/new" element={<EventNew />} />
        <Route path="/c/:clubSlug/events/:eventId" element={<EventDetail />} />
        <Route path="/c/:clubSlug/events/:eventId/scan" element={<EventScan />} />
        <Route path="/c/:clubSlug/events/:eventId/acquittal" element={<EventAcquittal />} />
        <Route path="/c/:clubSlug/committee" element={<Committee />} />
        <Route path="/c/:clubSlug/settings" element={<ClubSettings />} />
        <Route path="/c/:clubSlug/acquittal-packs" element={<AcquittalPacks />} />
        <Route path="/c/:clubSlug/analytics" element={<Analytics />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
      <Toaster />
      <SonnerToaster position="top-center" theme="light" />
    </QueryClientProvider>
  );
}
