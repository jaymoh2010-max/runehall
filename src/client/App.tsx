import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toasts } from "./components/Toasts";
import { LoadingScreen } from "./components/ui";
import { useSession } from "./stores";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { JoinCampaignPage } from "./pages/JoinCampaignPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CampaignPage } from "./pages/CampaignPage";
import { CharacterBuilderPage } from "./pages/CharacterBuilderPage";
import { CharacterSheetPage } from "./pages/CharacterSheetPage";
import { LibraryPage } from "./pages/LibraryPage";
import { RulesPage } from "./pages/RulesPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { NotFoundPage } from "./pages/NotFoundPage";

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
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
          <Route path="/characters/:id/edit" element={<CharacterBuilderPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
      <Toasts />
    </BrowserRouter>
  );
}
