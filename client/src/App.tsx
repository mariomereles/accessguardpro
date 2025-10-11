import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Register from "@/pages/Register";
import MyTicket from "@/pages/MyTicket";
import AdminDashboard from "@/pages/AdminDashboard";
import StaffScanner from "@/pages/StaffScanner";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/register" component={Register} />
      <Route path="/me/ticket" component={MyTicket} />
      <Route path="/staff/scanner" component={StaffScanner} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Switch>
            {/* Public routes without sidebar */}
            <Route path="/" component={Home} />
            <Route path="/register" component={Register} />
            <Route path="/me/ticket" component={MyTicket} />
            <Route path="/staff/scanner" component={StaffScanner} />

            {/* Admin routes with sidebar */}
            <Route path="/admin/:rest*">
              {() => (
                <SidebarProvider style={style as React.CSSProperties}>
                  <div className="flex h-screen w-full">
                    <AppSidebar />
                    <div className="flex flex-col flex-1">
                      <header className="flex items-center justify-between p-4 border-b">
                        <SidebarTrigger data-testid="button-sidebar-toggle" />
                        <ThemeToggle />
                      </header>
                      <main className="flex-1 overflow-auto p-8">
                        <AdminRouter />
                      </main>
                    </div>
                  </div>
                </SidebarProvider>
              )}
            </Route>

            {/* 404 fallback */}
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
