import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  DoorOpen,
  Users,
  Settings,
  BarChart3,
  ScanLine,
  Ticket,
  LogOut,
  User,
  Building2,
  UserCog,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const adminItems = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Gates", url: "/admin/gates", icon: DoorOpen },
  { title: "Attendees", url: "/admin/attendees", icon: Users },
  { title: "Events", url: "/admin/events", icon: BarChart3 },
  { title: "Activity", url: "/admin/activity", icon: Settings },
];

const staffItems = [
  { title: "Scanner", url: "/staff/scanner", icon: ScanLine },
  { title: "My Ticket", url: "/me/ticket", icon: Ticket },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin, isManager, isPlatformAdmin } = useAuth();
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    toast({
      title: "👋 Sesión cerrada",
      description: "Has cerrado sesión exitosamente",
    });
  };

  const items = isManager
    ? [
        ...adminItems,
        ...(isAdmin ? [{ title: "Users", url: "/admin/users", icon: UserCog }] : []),
        ...(isPlatformAdmin ? [{ title: "Organizations", url: "/admin/organizations", icon: Building2 }] : []),
      ]
    : staffItems;

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ScanLine className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-lg">AccessGuard Pro</h2>
            <p className="text-xs text-muted-foreground">Sistema de Control</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Panel de Control</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar Sesión
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
