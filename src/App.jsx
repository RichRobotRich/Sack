import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Login from './pages/Login';
import OfficeOverviewEF from './pages/OfficeOverviewEF';
import LeaveManagement from './pages/LeaveManagement';
import SickLeaveManagement from './pages/SickLeaveManagement';
import AnnualLeaveOverviewPage from './pages/AnnualLeaveOverviewPage';
import EarlyShiftPage from './pages/EarlyShiftPage';
import AzubiManagement from './pages/AzubiManagement';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import UpdatePrompt from '@/components/UpdatePrompt';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const LoadingSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

/**
 * Alles außer der Anmeldeseite hängt hinter der Anmeldung. Die Seite selbst
 * muss ohne Anmeldung erreichbar bleiben, sonst würde die Weiterleitung
 * dorthin im Kreis laufen.
 */
const GatedRoutes = () => {
  const { isLoadingAuth, authError, navigateToLogin } = useAuth();

  if (isLoadingAuth) {
    return <LoadingSpinner />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    navigateToLogin();
    return null;
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/OfficeOverviewEF" element={<LayoutWrapper currentPageName="OfficeOverviewEF"><OfficeOverviewEF /></LayoutWrapper>} />
      <Route path="/LeaveManagement" element={<LayoutWrapper currentPageName="LeaveManagement"><LeaveManagement /></LayoutWrapper>} />
      <Route path="/SickLeaveManagement" element={<LayoutWrapper currentPageName="SickLeaveManagement"><SickLeaveManagement /></LayoutWrapper>} />
      <Route path="/AnnualLeaveOverviewPage" element={<LayoutWrapper currentPageName="AnnualLeaveOverviewPage"><AnnualLeaveOverviewPage /></LayoutWrapper>} />
      <Route path="/EarlyShiftPage" element={<LayoutWrapper currentPageName="EarlyShiftPage"><EarlyShiftPage /></LayoutWrapper>} />
      <Route path="/AzubiManagement" element={<LayoutWrapper currentPageName="AzubiManagement"><AzubiManagement /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="*" element={<GatedRoutes />} />
  </Routes>
);

function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AppRoutes />
        </Router>
        <Toaster />
        <UpdatePrompt />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
