import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { Toaster as SonnerToaster } from 'sonner';

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
import Account from '@/pages/Account';
import PublicRSVP from '@/pages/PublicRSVP';
import PublicClub from '@/pages/PublicClub';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import AppShell from '@/components/AppShell';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, currentUser } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-[3px] border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/rsvp/:eventId" element={<PublicRSVP />} />
      <Route path="/p/:clubSlug" element={<PublicClub />} />

      {/* Authenticated routes — gated below */}
      <Route element={<AuthGate authError={authError} navigateToLogin={navigateToLogin} currentUser={currentUser}><AppShell /></AuthGate>}>
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
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function AuthGate({ children, authError, navigateToLogin, currentUser }) {
  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" theme="light" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App