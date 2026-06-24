"use client";

import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/routing";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Home, FileText } from "lucide-react";

const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Notes",
    url: "/dashboard/notes",
    icon: FileText,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpen } = useSidebar();
  const lastPath = useRef("");

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
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>NoeTree</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
