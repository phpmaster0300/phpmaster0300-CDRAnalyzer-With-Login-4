import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

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

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  updateProfile: (updatedUser: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if user is already logged in from localStorage
    try {
      const savedUser = safeLocalStorage.getItem('cdr_current_user');
      console.log('Auth check - saved user in storage:', savedUser);
      
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          console.log('Auth check - parsed user:', parsedUser);
          
          // Validate user object
          if (!parsedUser || typeof parsedUser !== 'object') {
            console.log('Auth check - invalid user object');
            safeLocalStorage.removeItem('cdr_current_user');
            return;
          }
          
          // Check if user account has expired
          if (parsedUser.expiryDate && new Date(parsedUser.expiryDate) < new Date()) {
            console.log('User session expired, logging out');
            safeLocalStorage.removeItem('cdr_current_user');
            return;
          }
          
          // Check if user is blocked
          if (parsedUser.isBlocked) {
            console.log('User account is blocked, logging out');
            safeLocalStorage.removeItem('cdr_current_user');
            return;
          }
          
          setUser(parsedUser);
        } catch (error) {
          console.error('Error parsing saved user:', error);
          safeLocalStorage.removeItem('cdr_current_user');
        }
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }, []);

  // Periodic check for expired sessions (every 5 minutes)
  useEffect(() => {
    if (!user) return;
    
    const checkUserStatus = () => {
      try {
        // Check if user account has expired
        if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
          console.log('User session expired during use, logging out');
          logout();
          return;
        }
        
        // Check if user is blocked (reload from storage to get latest status)
        const users = safeLocalStorage.getItem('cdr_users');
        if (users) {
          try {
            const userList = JSON.parse(users);
            if (Array.isArray(userList)) {
              const currentUser = userList.find((u: User) => u.id === user.id);
              if (currentUser && currentUser.isBlocked) {
                console.log('User account was blocked, logging out');
                logout();
                return;
              }
            }
          } catch (error) {
            console.error('Error checking user status:', error);
          }
        }
      } catch (error) {
        console.error('Error in periodic user status check:', error);
      }
    };
    
    // Check immediately
    checkUserStatus();
    
    // Set up periodic check every 5 minutes
    const interval = setInterval(checkUserStatus, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const login = (userData: User) => {
    setUser(userData);
    safeLocalStorage.setItem('cdr_current_user', JSON.stringify(userData));
  };

  const logout = () => {
    // Log logout activity if user is logged in
    if (user) {
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
          details: 'User logged out'
        };
        
        // Add new activity to the beginning of the array
        const updatedActivities = [newActivity, ...existingActivities];
        
        // Save to localStorage
        safeLocalStorage.setItem('cdr_user_activities', JSON.stringify(updatedActivities));
      } catch (error) {
        console.error('Error logging logout activity:', error);
      }
    }
    
    setUser(null);
    safeLocalStorage.removeItem('cdr_current_user');
  };

  const updateProfile = (updatedUser: User) => {
    try {
      setUser(updatedUser);
      safeLocalStorage.setItem('cdr_current_user', JSON.stringify(updatedUser));
      
      // Also update the user in the main users list
      const users = safeLocalStorage.getItem('cdr_users');
      if (users) {
        try {
          const userList = JSON.parse(users);
          if (Array.isArray(userList)) {
            const updatedUsers = userList.map((u: User) => 
              u.id === updatedUser.id ? updatedUser : u
            );
            safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));
          }
        } catch (error) {
          console.error('Error updating user in main list:', error);
        }
      }
    } catch (error) {
      console.error('Error in updateProfile:', error);
    }
  };

  const value = {
    user,
    login,
    logout,
    updateProfile,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}