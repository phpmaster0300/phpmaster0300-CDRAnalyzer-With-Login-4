import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AuthForm } from "@/components/AuthForm";
import Dashboard from "@/pages/dashboard";
import AdminPanel from "@/pages/admin-panel";
import NotFound from "@/pages/not-found";

interface User {
  id: string;
  name: string;
  city: string;
  whatsappNumber: string;
  email: string;
  password: string;
  createdAt: string;
  isBlocked?: boolean;
  expiryDate?: string;
  deviceLimit?: number;
  lastLogin?: string;
  loginCount?: number;
  activeDevices?: number;
  isAdmin?: boolean;
  isApproved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
}

// Create a protected route component
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { isAuthenticated, user } = useAuth();
  
  if (!isAuthenticated) {
    return <RedirectToLogin />;
  }
  
  // If admin is required, check if user is admin
  if (requireAdmin && !user?.isAdmin) {
    return <RedirectToDashboard />;
  }
  
  return <>{children}</>;
}

function RedirectToLogin() {
  const [, setLocation] = useLocation();
  setLocation("/");
  return null;
}

function RedirectToDashboard() {
  const [, setLocation] = useLocation();
  setLocation("/dashboard");
  return null;
}

// Create the main app router
function AppRouter() {
  const { user, login } = useAuth();
  const [location, setLocation] = useLocation();

  // Redirect authenticated users
  if (user) {
    // If user is on root path, redirect to dashboard
    if (location === "/") {
      setLocation("/dashboard");
      return null;
    }
  }

  return (
    <Switch>
      <Route path="/" component={() => <AuthForm onLogin={login} />} />
      <Route component={() => <AuthForm onLogin={login} />} />
    </Switch>
  );
}

// Create the authenticated app router
function AuthenticatedAppRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={() => (
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      )} />
      <Route path="/admin" component={() => (
        <ProtectedRoute requireAdmin={true}>
          <AdminPanel />
        </ProtectedRoute>
      )} />
      <Route path="/" component={() => (
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      )} />
    </Switch>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {isAuthenticated ? <AuthenticatedAppRouter /> : <AppRouter />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Wrap the entire app with the AuthProvider
function AppWithAuth() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

export default AppWithAuth;