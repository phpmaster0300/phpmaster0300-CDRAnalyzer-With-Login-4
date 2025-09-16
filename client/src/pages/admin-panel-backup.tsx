import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Search, 
  Edit, 
  Trash2, 
  Shield, 
  ShieldOff, 
  Download, 
  Upload, 
  Calendar,
  Smartphone,
  Activity,
  Eye,
  UserCheck,
  UserX,
  Settings,
  FileText,
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  loginCount?: number;
  lastLogin?: string;
  deviceCount?: number;
  isAdmin?: boolean;
}

interface UserActivity {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
  details: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [selectedUserActivity, setSelectedUserActivity] = useState<UserActivity[]>([]);
  const [activeTab, setActiveTab] = useState("users");
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Check if current user is admin
  const isAdmin = currentUser?.email === 'admin@admin.com' || currentUser?.isAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin]);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, users]);

  const loadUsers = () => {
    const storedUsers = localStorage.getItem('cdr_users');
    if (storedUsers) {
      const parsedUsers = JSON.parse(storedUsers);
      setUsers(parsedUsers);
    }
  };

  const saveUsers = (updatedUsers: User[]) => {
    localStorage.setItem('cdr_users', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
  };

  const filterUsers = () => {
    if (!searchTerm) {
      setFilteredUsers(users);
      return;
    }

    const filtered = users.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.whatsappNumber.includes(searchTerm)
    );
    setFilteredUsers(filtered);
  };

  const handleEditUser = (user: User) => {
    setEditingUser({ ...user });
    setIsEditModalOpen(true);
  };

  const handleSaveUser = () => {
    if (!editingUser) return;

    const updatedUsers = users.map(user =>
      user.id === editingUser.id ? editingUser : user
    );
    saveUsers(updatedUsers);
    setIsEditModalOpen(false);
    setEditingUser(null);

    toast({
      title: "User Updated",
      description: `${editingUser.name}'s details have been updated successfully.`
    });
  };

  const handleToggleBlock = (userId: string) => {
    const updatedUsers = users.map(user => {
      if (user.id === userId) {
        return { ...user, isBlocked: !user.isBlocked };
      }
      return user;
    });
    saveUsers(updatedUsers);

    const user = users.find(u => u.id === userId);
    toast({
      title: user?.isBlocked ? "User Unblocked" : "User Blocked",
      description: `${user?.name} has been ${user?.isBlocked ? 'unblocked' : 'blocked'} successfully.`
    });
  };

  const handleDeleteUser = (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    const updatedUsers = users.filter(user => user.id !== userId);
    saveUsers(updatedUsers);

    toast({
      title: "User Deleted",
      description: "User has been permanently deleted.",
      variant: "destructive"
    });
  };

  const handleExportUsers = () => {
    const dataStr = JSON.stringify(users, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cdr_users_export_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: `${users.length} users exported successfully.`
    });
  };

  const handleImportUsers = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedUsers = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedUsers)) {
          saveUsers(importedUsers);
          toast({
            title: "Import Complete",
            description: `${importedUsers.length} users imported successfully.`
          });
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        toast({
          title: "Import Failed",
          description: "Invalid file format. Please select a valid JSON file.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const viewUserActivity = (userId: string) => {
    // Mock activity data for now
    const mockActivity: UserActivity[] = [
      {
        id: '1',
        userId,
        action: 'Login',
        timestamp: new Date().toISOString(),
        details: 'User logged in successfully',
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome Browser'
      },
      {
        id: '2',
        userId,
        action: 'File Upload',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        details: 'Uploaded CDR file for analysis',
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome Browser'
      }
    ];
    setSelectedUserActivity(mockActivity);
    setIsActivityModalOpen(true);
  };

  const getStatusBadge = (user: User) => {
    if (user.isBlocked) {
      return <Badge variant="destructive">Blocked</Badge>;
    }
    if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
      return <Badge variant="secondary">Expired</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
              <p className="text-gray-600">You don't have permission to access the admin panel.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Panel</h1>
          <p className="text-gray-600">Manage users, monitor activity, and control system access</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      User Management
                    </CardTitle>
                    <CardDescription>
                      Manage user accounts, permissions, and access control
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleExportUsers} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <label htmlFor="import-file">
                      <Button variant="outline" size="sm" asChild>
                        <span className="cursor-pointer">
                          <Upload className="h-4 w-4 mr-2" />
                          Import
                        </span>
                      </Button>
                    </label>
                    <input
                      id="import-file"
                      type="file"
                      accept=".json"
                      onChange={handleImportUsers}
                      className="hidden"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-6">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    Total Users: {users.length}
                  </div>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Devices</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.city}</TableCell>
                          <TableCell>{user.whatsappNumber}</TableCell>
                          <TableCell>{getStatusBadge(user)}</TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {user.deviceCount || 0}/{user.deviceLimit || 5}
                            </span>
                          </TableCell>
                          <TableCell>
                            {user.expiryDate 
                              ? new Date(user.expiryDate).toLocaleDateString()
                              : 'No expiry'
                            }
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUser(user)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleBlock(user.id)}
                                className={user.isBlocked ? "text-green-600" : "text-red-600"}
                              >
                                {user.isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => viewUserActivity(user.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>System Activity</CardTitle>
                <CardDescription>Monitor user activity and system events</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Activity monitoring features coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Reports & Analytics</CardTitle>
                <CardDescription>Generate reports and view system analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Reporting features coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>Configure system-wide settings and preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Settings panel coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit User Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and settings
              </DialogDescription>
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
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={editingUser.city}
                    onChange={(e) => setEditingUser({...editingUser, city: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="whatsapp">WhatsApp Number</Label>
                  <Input
                    id="whatsapp"
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
                    onChange={(e) => setEditingUser({...editingUser, expiryDate: e.target.value})}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveUser}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* User Activity Modal */}
        <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>User Activity</DialogTitle>
              <DialogDescription>
                Recent activity and login history
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedUserActivity.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.action}</TableCell>
                      <TableCell>{activity.details}</TableCell>
                      <TableCell>
                        {new Date(activity.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>{activity.deviceInfo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}