import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertCircle, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface AuthFormProps {
  onLogin: (user: User) => void;
}

// Helper function to safely access localStorage
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.error('localStorage getItem error:', error);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('localStorage setItem error:', error);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('localStorage removeItem error:', error);
    }
  }
};

export function AuthForm({ onLogin }: AuthFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  // Login Form State
  const [loginData, setLoginData] = useState({
    email: "",
    password: ""
  });

  // Local Storage Database Functions
  const getUsersFromStorage = (): User[] => {
    try {
      const users = safeLocalStorage.getItem('cdr_users');
      console.log('_auth raw users from storage:', users);
      const parsedUsers = users ? JSON.parse(users) : [];
      console.log('_auth parsed users:', parsedUsers);
      return Array.isArray(parsedUsers) ? parsedUsers : [];
    } catch (error) {
      console.error('_auth error parsing users from storage:', error);
      return [];
    }
  };

  const findUserByEmail = (email: string): User | undefined => {
    const users = getUsersFromStorage();
    console.log('_auth searching for email:', email);
    console.log('_auth all users:', users);
    
    if (!email) return undefined;
    
    const foundUser = users.find(user => {
      try {
        return user.email && 
               typeof user.email === 'string' && 
               user.email.toLowerCase() === email.toLowerCase();
      } catch (error) {
        console.error('_auth error comparing email:', error);
        return false;
      }
    });
    
    console.log('_auth found user:', foundUser);
    return foundUser;
  };

  // Validation Functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    console.log('_auth login attempt with data:', loginData);

    if (!loginData.email || !loginData.password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    if (!validateEmail(loginData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    // Check for admin login
    const systemSettings = safeLocalStorage.getItem('cdr_system_settings');
    let adminEmail = 'admin@admin.com';
    let adminPassword = 'admin123';
    
    if (systemSettings) {
      try {
        const settings = JSON.parse(systemSettings);
        adminEmail = settings.adminEmail || 'admin@admin.com';
        adminPassword = settings.adminPassword || 'admin123';
      } catch (error) {
        console.error('Error reading admin settings:', error);
      }
    }
    
    
    console.log('_auth checking admin login - email:', loginData.email, 'adminEmail:', adminEmail);
    console.log('_auth checking admin login - password match:', loginData.password === adminPassword);
    
    if (loginData.email === adminEmail && loginData.password === adminPassword) {
      const adminUser: User = {
        id: 'admin-001',
        name: 'Administrator',
        city: 'System',
        whatsappNumber: '+92000000000',
        email: adminEmail,
        password: adminPassword,
        createdAt: new Date().toISOString(),
        isAdmin: true
      };

      // Log admin login activity
      try {
        // Get existing activities or initialize empty array
        let existingActivities: any[] = [];
        const activitiesStr = safeLocalStorage.getItem('cdr_user_activities');
        if (activitiesStr) {
          try {
            existingActivities = JSON.parse(activitiesStr);
          } catch (parseError) {
            console.error('Error parsing existing activities:', parseError);
            existingActivities = [];
          }
        }
        
        // Create new activity
        const newActivity = {
          id: crypto.randomUUID(),
          userId: adminUser.id,
          userName: adminUser.name,
          activityType: 'login',
          timestamp: new Date().toISOString(),
          details: 'Admin logged in successfully'
        };
        
        // Add new activity to the beginning of the array
        const updatedActivities = [newActivity, ...existingActivities];
        
        // Save to localStorage
        safeLocalStorage.setItem('cdr_user_activities', JSON.stringify(updatedActivities));
      } catch (error) {
        console.error('Error logging admin login activity:', error);
      }

      toast({
        title: "Admin Login Successful",
        description: "Welcome to Admin Panel!"
      });

      onLogin(adminUser);
      return;
    }

    console.log('_auth login attempt with email:', loginData.email);
    const user = findUserByEmail(loginData.email);
    
    console.log('_auth found user for login:', user);
    
    if (!user) {
      toast({
        title: "User Not Found",
        description: "No account found with this email address",
        variant: "destructive"
      });
      return;
    }

    // Check if user is blocked
    if (user.isBlocked) {
      // Get custom block message
      let blockMessage = "Your account has been blocked. Please contact administrator.";
      const systemSettings = safeLocalStorage.getItem('cdr_system_settings');
      if (systemSettings) {
        try {
          const settings = JSON.parse(systemSettings);
          blockMessage = settings.blockMessage || blockMessage;
        } catch (error) {
          // Use default message
        }
      }
      
      toast({
        title: "Account Blocked",
        description: blockMessage,
        variant: "destructive"
      });
      return;
    }

    // Check if user account has expired
    if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
      // Get custom expiry message
      let expiryMessage = "Your account has expired. Please contact administrator to renew access.";
      const systemSettings = safeLocalStorage.getItem('cdr_system_settings');
      if (systemSettings) {
        try {
          const settings = JSON.parse(systemSettings);
          expiryMessage = settings.expiryMessage || expiryMessage;
        } catch (error) {
          // Use default message
        }
      }
      
      toast({
        title: "Account Expired",
        description: expiryMessage,
        variant: "destructive"
      });
      return;
    }

    if (user.password !== loginData.password) {
      toast({
        title: "Invalid Password",
        description: "The password you entered is incorrect",
        variant: "destructive"
      });
      return;
    }

    // Update last login timestamp
    const updatedUser = {
      ...user,
      lastLogin: new Date().toISOString(),
      loginCount: (user.loginCount || 0) + 1
    };
    
    // Update user in storage with login info
    const users = getUsersFromStorage();
    const updatedUsers = users.map(u => u.id === user.id ? updatedUser : u);
    safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));

    // Log login activity
    try {
      // Get existing activities or initialize empty array
      let existingActivities: any[] = [];
      const activitiesStr = safeLocalStorage.getItem('cdr_user_activities');
      if (activitiesStr) {
        try {
          existingActivities = JSON.parse(activitiesStr);
        } catch (parseError) {
          console.error('Error parsing existing activities:', parseError);
          existingActivities = [];
        }
      }
      
      // Create new activity
      const newActivity = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        activityType: 'login',
        timestamp: new Date().toISOString(),
        details: 'User logged in successfully'
      };
      
      // Add new activity to the beginning of the array
      const updatedActivities = [newActivity, ...existingActivities];
      
      // Save to localStorage
      safeLocalStorage.setItem('cdr_user_activities', JSON.stringify(updatedActivities));
    } catch (error) {
      console.error('Error logging login activity:', error);
    }

    toast({
      title: "Login Successful",
      description: `Welcome back, ${user.name}!`
    });

    onLogin(updatedUser);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/90 backdrop-blur-lg">
        <CardHeader className="text-center pb-6 pt-8">
          <div className="mx-auto bg-gradient-to-r from-blue-600 to-indigo-700 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-gray-900">CDR Intelligence Analyst</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Secure Login to Your Analytics Dashboard</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="flex items-center gap-2 text-gray-700 font-medium">
                <Mail className="w-4 h-4" />
                Email Address
              </Label>
              <div className="relative">
                <Input
                  id="login-email"
                  type="email"
                  placeholder="Enter your email"
                  value={loginData.email}
                  onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                  required
                  className="pl-10 py-6 border-2 border-gray-200 focus:border-blue-500 focus:ring-0 rounded-lg"
                />
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password" className="flex items-center gap-2 text-gray-700 font-medium">
                <Lock className="w-4 h-4" />
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                  required
                  className="pl-10 pr-12 py-6 border-2 border-gray-200 focus:border-blue-500 focus:ring-0 rounded-lg"
                />
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white py-6 rounded-lg font-semibold text-lg shadow-lg transition-all duration-300 transform hover:scale-[1.02]">
              Sign In
            </Button>
            

          </form>
        </CardContent>
      </Card>
    </div>
  );
}