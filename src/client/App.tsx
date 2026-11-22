import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toasts } from "./components/Toasts";
import { LoadingScreen } from "./components/ui";
import { useSession } from "./stores";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { JoinCampaignPage } from "./pages/JoinCampaignPage";
import { CompendiumEntryPage } from "./pages/CompendiumEntryPage";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage }))
);
const CampaignPage = lazy(() =>
  import("./pages/CampaignPage").then((module) => ({ default: module.CampaignPage }))
);
const CharacterBuilderPage = lazy(() =>
  import("./pages/CharacterBuilderPage").then((module) => ({
    default: module.CharacterBuilderPage,
  }))
);
const PathbuilderSheetPage = lazy(() =>
  import("./pages/PathbuilderSheetPage").then((module) => ({
    default: module.PathbuilderSheetPage,
  }))
);
const LibraryPage = lazy(() =>
  import("./pages/LibraryPage").then((module) => ({ default: module.LibraryPage }))
);
const RulesPage = lazy(() =>
  import("./pages/RulesPage").then((module) => ({ default: module.RulesPage }))
);
const AccountPage = lazy(() =>
  import("./pages/AccountPage").then((module) => ({ default: module.AccountPage }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage }))
);

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useSession((state) => state.user);
  const ready = useSession((state) => state.ready);
  const location = useLocation();
  if (!ready) return <LoadingScreen label="Finding your seat…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const refresh = useSession((state) => state.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen label="Opening the hall…" />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/join/:code" element={<JoinCampaignPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/campaigns" element={<DashboardPage />} />
              <Route path="/campaigns/:id" element={<CampaignPage />} />
              <Route path="/characters/:id" element={<PathbuilderSheetPage />} />
              <Route path="/characters/:id/edit" element={<CharacterBuilderPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/library/:kind/:id" element={<CompendiumEntryPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toasts />
    </BrowserRouter>
  );
}
