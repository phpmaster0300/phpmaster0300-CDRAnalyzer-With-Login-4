import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, 
  Settings, 
  Activity, 
  Edit,
  Trash2,
  User,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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

interface User {
  id: string;
  name: string;
  email: string;
  city: string;
  whatsappNumber: string;
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

// Define UserActivity interface
interface UserActivity {
  id: string;
  userId: string;
  userName: string;
  activityType: 'login' | 'file_upload' | 'password_change' | 'profile_update' | 'user_created' | 'user_blocked' | 'user_unblocked';
  timestamp: string;
  details?: string;
}

export default function AdminPanel() {
  const { user: currentUser, logout, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const savedUsers = safeLocalStorage.getItem('cdr_users');
      return savedUsers ? JSON.parse(savedUsers) : [];
    } catch (error) {
      console.error('Error parsing users from localStorage:', error);
      return [];
    }
  });
  const [userActivities, setUserActivities] = useState<UserActivity[]>(() => {
    try {
      const savedActivities = safeLocalStorage.getItem('cdr_user_activities');
      return savedActivities ? JSON.parse(savedActivities) : [];
    } catch (error) {
      console.error('Error parsing user activities from localStorage:', error);
      return [];
    }
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const { toast } = useToast();

  // Add state for admin profile editing
  const [adminProfile, setAdminProfile] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    city: currentUser?.city || '',
    whatsappNumber: currentUser?.whatsappNumber || ''
  });

  // Update admin profile state when current user changes
  useEffect(() => {
    if (currentUser) {
      setAdminProfile({
        name: currentUser.name || '',
        email: currentUser.email || '',
        city: currentUser.city || '',
        whatsappNumber: currentUser.whatsappNumber || ''
      });
    }
  }, [currentUser]);

  // Load users from localStorage using correct keys
  const loadData = () => {
    console.log('📊 Loading admin panel data...');
    
    // DIRECT APPROACH: Always read fresh data from localStorage
    try {
      // Load approved users from cdr_users
      const savedUsers = safeLocalStorage.getItem('cdr_users');
      console.log('📊 Raw approved users data:', savedUsers);
      if (savedUsers) {
        const approvedUsers = JSON.parse(savedUsers);
        console.log('📊 Parsed approved users:', approvedUsers);
        setUsers(Array.isArray(approvedUsers) ? approvedUsers : []);
      } else {
        console.log('📊 No approved users found');
        setUsers([]);
      }
      
      // Load user activities
      const savedActivities = safeLocalStorage.getItem('cdr_user_activities');
      if (savedActivities) {
        const activities = JSON.parse(savedActivities);
        console.log('📊 Parsed user activities:', activities);
        setUserActivities(Array.isArray(activities) ? activities : []);
      } else {
        console.log('📊 No user activities found');
        setUserActivities([]);
      }
      
      // Force a complete localStorage check
      console.log('📊 All localStorage keys:', Object.keys(localStorage || {}));
      console.log('📊 Complete localStorage content:');
      if (typeof localStorage !== 'undefined' && localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('cdr_')) {
            console.log(`📊 ${key}:`, safeLocalStorage.getItem(key));
          }
        }
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
      setUsers([]);
      setUserActivities([]);
    }
  };

  useEffect(() => {
    loadData();
  }, [forceUpdate]);

  // Add storage event listener to detect localStorage changes from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('cdr_')) {
        console.log('🔄 Storage changed:', e.key, 'New value:', e.newValue);
        loadData();
      }
    };

    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Add refresh function to reload data
  const refreshData = () => {
    console.log('🔄 Manual refresh triggered');
    setForceUpdate(prev => prev + 1);
    loadData();
    toast({
      title: "Data Refreshed",
      description: "Admin panel data has been reloaded from storage."
    });
  };

  // Function to log user activities
  const logUserActivity = (activity: Omit<UserActivity, 'id' | 'timestamp'>) => {
    try {
      const newActivity: UserActivity = {
        ...activity,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      };

      const updatedActivities = [newActivity, ...userActivities];
      setUserActivities(updatedActivities);
      
      // Save to localStorage
      safeLocalStorage.setItem('cdr_user_activities', JSON.stringify(updatedActivities));
    } catch (error) {
      console.error('Error logging user activity:', error);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleSaveUser = () => {
    if (!editingUser) return;
    
    // Check if we're adding a new user (no ID) or editing existing user
    if (!editingUser.id) {
      // Adding new user
      const newUser = {
        ...editingUser,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        isBlocked: false,
        loginCount: 0,
        activeDevices: 0
      };
      
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      
      // Update localStorage
      safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));
      
      // Log user creation activity
      logUserActivity({
        userId: newUser.id,
        userName: newUser.name,
        activityType: 'user_created',
        details: `User created by admin`
      });
      
      // Debug: Log the saved user data
      console.log('_saved newUser:', newUser);
      console.log('_saved updatedUsers:', updatedUsers);
      
      toast({
        title: "User Added",
        description: "New user has been successfully added to the system."
      });
    } else {
      // Editing existing user
      const updatedUsers = users.map(user => 
        user.id === editingUser.id ? editingUser : user
      );
      setUsers(updatedUsers);
      
      // Update localStorage
      safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));
      
      // Log user update activity
      logUserActivity({
        userId: editingUser.id,
        userName: editingUser.name,
        activityType: 'profile_update',
        details: `User profile updated by admin`
      });
      
      toast({
        title: "User Updated",
        description: "User information has been successfully updated."
      });
    }
    
    setIsEditModalOpen(false);
    setEditingUser(null);
  };

  const handleBlockUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const updatedUsers = users.map(u =>
      u.id === userId ? { ...u, isBlocked: !u.isBlocked } : u
    );
    setUsers(updatedUsers);

    // Update localStorage using correct key
    safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));

    // Log user block/unblock activity
    logUserActivity({
      userId: user.id,
      userName: user.name,
      activityType: user.isBlocked ? 'user_unblocked' : 'user_blocked',
      details: user.isBlocked ? `User unblocked by admin` : `User blocked by admin`
    });

    toast({
      title: user.isBlocked ? "User Unblocked" : "User Blocked",
      description: `${user.name} has been ${user.isBlocked ? 'unblocked' : 'blocked'}.`
    });
  };

  const handleDeleteUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const updatedUsers = users.filter(user => user.id !== userId);
    setUsers(updatedUsers);

    // Update localStorage using correct key
    safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));

    // Log user deletion activity
    logUserActivity({
      userId: user.id,
      userName: user.name,
      activityType: 'profile_update',
      details: `User deleted by admin`
    });

    toast({
      title: "User Deleted",
      description: `${user.name} has been deleted from the system.`
    });
  };

  // Add function to handle admin profile updates
  const handleAdminProfileUpdate = () => {
    if (!currentUser) return;
    
    // Update current user in context
    const updatedUser = {
      ...currentUser,
      name: adminProfile.name,
      email: adminProfile.email,
      city: adminProfile.city,
      whatsappNumber: adminProfile.whatsappNumber
    };
    
    // Update profile in context
    updateProfile(updatedUser);
    
    // Also update in localStorage
    try {
      const users = safeLocalStorage.getItem('cdr_users');
      if (users) {
        const userList = JSON.parse(users);
        if (Array.isArray(userList)) {
          const updatedUsers = userList.map((u: User) => 
            u.id === updatedUser.id ? updatedUser : u
          );
          safeLocalStorage.setItem('cdr_users', JSON.stringify(updatedUsers));
        }
      }
      
      // Also update the current user in localStorage
      safeLocalStorage.setItem('cdr_current_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Error updating user in localStorage:', error);
    }
    
    toast({
      title: "Profile Updated",
      description: "Your admin profile has been successfully updated."
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Manage users and system configuration</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={logout}
              variant="outline" 
              className="bg-red-600 hover:bg-red-700 text-white border-red-600 flex items-center gap-2"
            >
              Logout
            </Button>
            <Button onClick={refreshData} variant="outline" className="flex items-center gap-2">
              🔄 Refresh Data
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="user-activity" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              User Activity
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage system users and their permissions</CardDescription>
                  </div>
                  <Button onClick={() => {
                    // Set editing user to null to indicate we're adding a new user
                    setEditingUser({
                      id: '',
                      name: '',
                      email: '',
                      city: '',
                      whatsappNumber: '',
                      password: '',
                      createdAt: new Date().toISOString(),
                      isBlocked: false,
                      loginCount: 0,
                      activeDevices: 0,
                      isAdmin: false,
                      deviceLimit: 5,
                      expiryDate: '',
                      isApproved: true,
                      approvedAt: new Date().toISOString(),
                      approvedBy: 'admin'
                    });
                    setIsEditModalOpen(true);
                  }}>
                    Add New User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.city}</TableCell>
                        <TableCell>
                          {user.expiryDate 
                            ? new Date(user.expiryDate).toLocaleDateString() 
                            : 'No expiry date'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.isBlocked ? "destructive" : "default"}>
                            {user.isBlocked ? "Blocked" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={user.isBlocked ? "default" : "destructive"}
                            onClick={() => handleBlockUser(user.id)}
                          >
                            {user.isBlocked ? "Unblock" : "Block"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Activity</CardTitle>
                <CardDescription>Monitor user activity and system events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-800">Total Users</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{users.length}</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-800">Active Users</span>
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      {users.filter(u => !u.isBlocked).length}
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-orange-600" />
                      <span className="font-medium text-orange-800">Expired Users</span>
                    </div>
                    <div className="text-2xl font-bold text-orange-900">{users.filter(u => u.expiryDate && new Date(u.expiryDate) < new Date()).length}</div>
                  </div>
                </div>
                
                {/* Expired Users Section */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Expired Users</h3>
                  {users.filter(u => u.expiryDate && new Date(u.expiryDate) < new Date()).length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Expiry Date</TableHead>
                            <TableHead>Days Expired</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users
                            .filter(u => u.expiryDate && new Date(u.expiryDate) < new Date())
                            .map((user) => {
                              const expiryDate = new Date(user.expiryDate!);
                              const today = new Date();
                              const diffTime = Math.abs(today.getTime() - expiryDate.getTime());
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              
                              return (
                                <TableRow key={user.id}>
                                  <TableCell className="font-medium">{user.name}</TableCell>
                                  <TableCell>{user.email}</TableCell>
                                  <TableCell>{expiryDate.toLocaleDateString()}</TableCell>
                                  <TableCell>{diffDays} days ago</TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p>No expired users found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Admin Profile</CardTitle>
                <CardDescription>Manage your admin account settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-2xl">
                  <div className="grid gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="adminName">Full Name</Label>
                        <Input
                          id="adminName"
                          value={adminProfile.name}
                          onChange={(e) => setAdminProfile({...adminProfile, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminEmail">Email Address</Label>
                        <Input
                          id="adminEmail"
                          value={adminProfile.email}
                          onChange={(e) => setAdminProfile({...adminProfile, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="adminCity">City</Label>
                        <Input
                          id="adminCity"
                          value={adminProfile.city}
                          onChange={(e) => setAdminProfile({...adminProfile, city: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminPhone">Phone Number</Label>
                        <Input
                          id="adminPhone"
                          value={adminProfile.whatsappNumber}
                          onChange={(e) => setAdminProfile({...adminProfile, whatsappNumber: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-200">
                      <Button onClick={handleAdminProfileUpdate}>
                        Save Profile Changes
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Debug Tab */}
          <TabsContent value="user-activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Activity Log</CardTitle>
                <CardDescription>Track user login details, file uploads, and other activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {userActivities.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Activity className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p>No user activities recorded yet</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Activity</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead>Date & Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...userActivities]
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((activity) => (
                              <TableRow key={activity.id}>
                                <TableCell className="font-medium">{activity.userName}</TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      activity.activityType === 'login' ? 'default' :
                                      activity.activityType === 'file_upload' ? 'secondary' :
                                      activity.activityType === 'password_change' ? 'destructive' :
                                      activity.activityType === 'user_created' ? 'outline' :
                                      'default'
                                    }
                                  >
                                    {activity.activityType.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {activity.details || '-'}
                                </TableCell>
                                <TableCell>
                                  {new Date(activity.timestamp).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit User Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingUser?.id ? 'Edit User' : 'Add New User'}</DialogTitle>
              <DialogDescription>{editingUser?.id ? 'Update user information and settings' : 'Create a new user account'}</DialogDescription>
            </DialogHeader>
            {editingUser && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={editingUser.password}
                      onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">{editingUser.id ? 'Leave blank to keep current password' : 'Set initial password'}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={editingUser.city}
                    onChange={(e) => setEditingUser({...editingUser, city: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="whatsappNumber">WhatsApp Number</Label>
                  <Input
                    id="whatsappNumber"
                    value={editingUser.whatsappNumber}
                    onChange={(e) => setEditingUser({...editingUser, whatsappNumber: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deviceLimit">Device Limit</Label>
                  <Input
                    id="deviceLimit"
                    type="number"
                    value={editingUser.deviceLimit || 5}
                    onChange={(e) => setEditingUser({...editingUser, deviceLimit: parseInt(e.target.value) || 5})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={editingUser.expiryDate ? editingUser.expiryDate.split('T')[0] : ''}
                    onChange={(e) => setEditingUser({...editingUser, expiryDate: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="isAdmin"
                    type="checkbox"
                    checked={editingUser.isAdmin || false}
                    onChange={(e) => setEditingUser({...editingUser, isAdmin: e.target.checked})}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isAdmin">Is Admin User</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveUser}>
                    {editingUser.id ? 'Save Changes' : 'Add User'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}