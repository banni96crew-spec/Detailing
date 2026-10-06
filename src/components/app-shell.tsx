import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import { CalendarCheckIcon, HouseIcon, ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { Text } from "@astryxdesign/core/Text";
import { useTenant } from "@/tenant/tenant-context";
import { isDemoMode } from "@/lib/env";
import { useLiquidGlass } from "@/lib/use-liquid-glass";

export function AppShell() {
  const tenant = useTenant();
  const { slug = tenant.slug } = useParams();
  useLiquidGlass(".bottom-nav.liquid-glass");
  const items = [
    { to: `/s/${slug}/`, label: "Главная", icon: HouseIcon, end: true },
    { to: `/s/${slug}/services`, label: "Услуги", icon: ListMagnifyingGlassIcon, end: false },
    { to: `/s/${slug}/my-booking`, label: "Моя запись", icon: CalendarCheckIcon, end: false },
  ];

  return (
    <AstryxAppShell
      height="auto"
      variant="wash"
      contentPadding={0}
      banner={isDemoMode ? <aside className="preview-banner">Образец: уведомления и платежи не отправляются</aside> : undefined}
    >
      <Outlet />
      <nav className="bottom-nav liquid-glass" aria-label="Основная навигация">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "bottom-nav-link is-active" : "bottom-nav-link")}>
            <Icon aria-hidden="true" weight="regular" />
            <Text type="supporting" color="inherit">{label}</Text>
          </NavLink>
        ))}
      </nav>
    </AstryxAppShell>
  );
}
