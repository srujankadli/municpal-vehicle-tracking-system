import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './design-system/ThemeProvider';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider } from './auth/AuthContext';
import { RouteGuard } from './auth/RouteGuard';
import { AppLayout } from './shell/AppLayout';
import { LoginPage, ForbiddenPage } from './routes/PortalShells';
import { AuthorityLayout, AuthorityPlaceholder } from './routes/authority/AuthorityLayout';
import { AuthorityOperationsPage } from './routes/authority/AuthorityOperationsPage';
import { AuthorityFleetPage } from './routes/authority/AuthorityFleetPage';
import { AuthorityRoutesPage } from './routes/authority/AuthorityRoutesPage';
import { AuthorityVerificationPage } from './routes/authority/AuthorityVerificationPage';
import { AuthorityAnomaliesPage } from './routes/authority/AuthorityAnomaliesPage';
import { AuthorityComplaintsPage } from './routes/authority/AuthorityComplaintsPage';
import { AuthorityReconciliationPage } from './routes/authority/AuthorityReconciliationPage';
import { AuthorityAuditPage } from './routes/authority/AuthorityAuditPage';
import { WorkerDashboard } from './routes/worker/WorkerDashboard';
import { CitizenLayout } from './routes/citizen/CitizenLayout';
import { CitizenOverviewPage } from './routes/citizen/CitizenOverviewPage';
import { CitizenServicePage } from './routes/citizen/CitizenServicePage';
import { CitizenComplaintsPage } from './routes/citizen/CitizenComplaintsPage';
import { CitizenPaymentsPage } from './routes/citizen/CitizenPaymentsPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Navigate to="/login" replace />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="forbidden" element={<ForbiddenPage />} />

                {/* Authority Portal Boundary */}
                <Route
                  path="authority"
                  element={
                    <RouteGuard allowedRoles={['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN']}>
                      <AuthorityLayout />
                    </RouteGuard>
                  }
                >
                  <Route index element={<Navigate to="operations" replace />} />
                  <Route path="operations" element={<AuthorityOperationsPage />} />
                  <Route path="fleet" element={<AuthorityFleetPage />} />
                  <Route path="routes" element={<AuthorityRoutesPage />} />
                  <Route path="verification" element={<AuthorityVerificationPage />} />
                  <Route path="anomalies" element={<AuthorityAnomaliesPage />} />
                  <Route path="complaints" element={<AuthorityComplaintsPage />} />
                  <Route path="reconciliation" element={<AuthorityReconciliationPage />} />
                  <Route path="audit" element={<AuthorityAuditPage />} />
                </Route>

                {/* Field Worker Portal Boundary */}
                <Route
                  path="worker/*"
                  element={
                    <RouteGuard allowedRoles={['WORKER', 'DRIVER', 'SUPERVISOR', 'ADMIN']}>
                      <WorkerDashboard />
                    </RouteGuard>
                  }
                />

                {/* Driver Portal Boundary (Shares mobile-first terminal) */}
                <Route
                  path="driver/*"
                  element={
                    <RouteGuard allowedRoles={['DRIVER', 'WORKER', 'SUPERVISOR', 'ADMIN']}>
                      <WorkerDashboard />
                    </RouteGuard>
                  }
                />

                {/* Citizen Portal Boundary */}
                <Route
                  path="citizen"
                  element={
                    <RouteGuard allowedRoles={['CITIZEN', 'ADMIN']}>
                      <CitizenLayout />
                    </RouteGuard>
                  }
                >
                  <Route index element={<CitizenOverviewPage />} />
                  <Route path="service" element={<CitizenServicePage />} />
                  <Route path="complaints" element={<CitizenComplaintsPage />} />
                  <Route path="payments" element={<CitizenPaymentsPage />} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
};

export default App;
