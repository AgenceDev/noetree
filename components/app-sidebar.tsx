"use client";

import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/routing";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Home, FileText } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import { useTranslations } from "next-intl";

const items = [
  {
    title: "dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "notes",
    url: "/dashboard/notes",
    icon: FileText,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpen } = useSidebar();
  const lastPath = useRef("");
  const t = useTranslations("Sidebar");

  useEffect(() => {
    const isEditorPage =
      pathname.startsWith("/dashboard/notes/") &&
      pathname !== "/dashboard/notes" &&
      pathname !== "/dashboard/notes/";

    if (isEditorPage && lastPath.current !== pathname) {
      setOpen(false);
      lastPath.current = pathname;
    } else if (lastPath.current !== pathname) {
      lastPath.current = pathname;
    }
  }, [pathname, setOpen]);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("title")}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{t(item.title)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
