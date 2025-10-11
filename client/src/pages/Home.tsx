import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScanLine, Shield, Zap, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background"></div>
        
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-primary/10 mb-4">
              <ScanLine className="h-10 w-10 text-primary" />
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              Event Access Control
              <span className="block text-primary mt-2">Made Simple</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional QR-based access control system for events. Fast check-ins, real-time monitoring, and enterprise-grade security.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" data-testid="button-register">
                <Link href="/register">Register for Event</Link>
              </Button>
              <Button asChild variant="outline" size="lg" data-testid="button-admin">
                <Link href={isAuthenticated ? "/admin/dashboard" : "/login"}>
                  {isAuthenticated ? "Admin Dashboard" : "Admin Login"}
                </Link>
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-chart-3/10 mb-4">
                <Zap className="h-6 w-6 text-chart-3" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground">
                Check-in attendees in seconds with dual QR mode technology
              </p>
            </div>

            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure & Reliable</h3>
              <p className="text-sm text-muted-foreground">
                JWT-based authentication with Redis anti-duplication locks
              </p>
            </div>

            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-chart-2/10 mb-4">
                <Users className="h-6 w-6 text-chart-2" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multi-Gate Support</h3>
              <p className="text-sm text-muted-foreground">
                Concurrent check-ins across multiple entry points
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="border-t">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold font-mono text-primary">99.9%</div>
              <div className="text-sm text-muted-foreground mt-2">Uptime</div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono text-primary">&lt;200ms</div>
              <div className="text-sm text-muted-foreground mt-2">Response Time</div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono text-primary">100k+</div>
              <div className="text-sm text-muted-foreground mt-2">Check-ins</div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono text-primary">0.5%</div>
              <div className="text-sm text-muted-foreground mt-2">Error Rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
