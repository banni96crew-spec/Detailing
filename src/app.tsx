import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/app-state";
import { TenantProvider } from "@/tenant/tenant-context";

const HomePage = lazy(() => import("@/pages/home-page").then((module) => ({ default: module.HomePage })));
const ServicesPage = lazy(() => import("@/pages/services-page").then((module) => ({ default: module.ServicesPage })));
const WorksPage = lazy(() => import("@/pages/works-page").then((module) => ({ default: module.WorksPage })));
const ContactPage = lazy(() => import("@/pages/contact-page").then((module) => ({ default: module.ContactPage })));
const MyBookingPage = lazy(() => import("@/pages/my-booking-page").then((module) => ({ default: module.MyBookingPage })));
const BookingTimePage = lazy(() => import("@/booking/booking-time-page").then((module) => ({ default: module.BookingTimePage })));
const OwnerRoute = lazy(() => import("@/owner/owner-route").then((module) => ({ default: module.OwnerRoute })));
const OwnerDashboardPage = lazy(() => import("@/owner/owner-dashboard-page").then((module) => ({ default: module.OwnerDashboardPage })));
const OwnerSettingsPage = lazy(() => import("@/owner/owner-settings-page").then((module) => ({ default: module.OwnerSettingsPage })));
const OwnerNewBookingPage = lazy(() => import("@/owner/owner-new-booking-page").then((module) => ({ default: module.OwnerNewBookingPage })));

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Открываем раздел" />}>{children}</Suspense>;
}

function TenantRoute() {
  const { slug } = useParams();
  if (!slug) return <ErrorState title="Адрес студии не указан" detail="Откройте ссылку вида /s/название/" />;
  return (
    <TenantProvider slug={slug}>
      <Outlet />
    </TenantProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/s/graphite/" replace />} />
      <Route path="/s/:slug" element={<TenantRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Deferred><HomePage /></Deferred>} />
          <Route path="services" element={<Deferred><ServicesPage /></Deferred>} />
          <Route path="works" element={<Deferred><WorksPage /></Deferred>} />
          <Route path="contact" element={<Deferred><ContactPage /></Deferred>} />
          <Route path="my-booking" element={<Deferred><MyBookingPage /></Deferred>} />
        </Route>
        <Route path="book/:serviceKey" element={<Deferred><BookingTimePage /></Deferred>} />
        <Route path="owner" element={<Deferred><OwnerRoute /></Deferred>}>
          <Route index element={<Deferred><OwnerDashboardPage /></Deferred>} />
          <Route path="new" element={<Deferred><OwnerNewBookingPage /></Deferred>} />
          <Route path="settings" element={<Deferred><OwnerSettingsPage /></Deferred>} />
        </Route>
      </Route>
      <Route path="*" element={<ErrorState title="Страница не найдена" detail="Проверьте адрес ссылки" />} />
    </Routes>
  );
}
