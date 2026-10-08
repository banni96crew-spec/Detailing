import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import { CalendarCheckIcon, HouseIcon, ListMagnifyingGlassIcon, UserCircleIcon } from "@phosphor-icons/react";
import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { useTenant } from "@/tenant/tenant-context";

export function AppShell() {
  const tenant = useTenant();
  const { slug = tenant.slug } = useParams();
  const location = useLocation();
  const items = [
    { to: `/s/${slug}/`, label: "Главная", icon: HouseIcon, end: true, aliases: [`/s/${slug}/works`, `/s/${slug}/contact`] },
    { to: `/s/${slug}/services`, label: "Услуги", icon: ListMagnifyingGlassIcon, end: false, aliases: [] },
    { to: `/s/${slug}/my-booking`, label: "Моя запись", icon: CalendarCheckIcon, end: false, aliases: [] },
  ];

  return (
    <AstryxAppShell
      height="auto"
      variant="wash"
      contentPadding={0}
    >
      <header className="brand-header">
        <HStack gap={3} justify="between" align="center">
          <HStack gap={2} align="center">
            <img className="brand-mark" src={tenant.assets.logo} alt="" width="48" height="48" />
            <Text weight="semibold">{tenant.brand.shortName}</Text>
          </HStack>
          <Button
            label="Кабинет владельца"
            variant="ghost"
            size="lg"
            isIconOnly
            icon={<UserCircleIcon aria-hidden="true" weight="regular" />}
            href={`/s/${slug}/owner/`}
          />
        </HStack>
      </header>
      <Outlet />
      <nav className="bottom-nav" aria-label="Основная навигация">
        {items.map(({ to, label, icon: Icon, end, aliases }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-current={aliases.includes(location.pathname) ? "page" : undefined}
            className={({ isActive }) => (isActive || aliases.includes(location.pathname) ? "bottom-nav-link is-active" : "bottom-nav-link")}
          >
            <Icon aria-hidden="true" weight="regular" />
            <Text type="supporting" color="inherit">{label}</Text>
          </NavLink>
        ))}
      </nav>
    </AstryxAppShell>
  );
}
