import express from "express";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const router = express.Router();

// In-memory storage for user sessions and device tracking
const userSessions = new Map();
const userDevices = new Map();
const userActivity = new Map();

// Middleware to check if user is admin
const requireAdmin = (req: any, res: any, next: any) => {
  // For now, check if the user email is admin@admin.com
  // In production, this should use proper session management
  const adminEmail = req.headers['admin-email'] || req.query.adminEmail;
  
  if (adminEmail !== 'admin@admin.com') {
    return res.status(403).json({ 
      error: 'Access denied. Admin privileges required.' 
    });
  }
  
  next();
};

// Get all users
router.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    // In a real app, this would come from a database
    // For now, we'll simulate user data with enhanced fields
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    // Add computed fields for admin view
    const enhancedUsers = users.map((user: any) => ({
      ...user,
      loginCount: userSessions.get(user.id)?.loginCount || 0,
      lastLogin: userSessions.get(user.id)?.lastLogin || null,
      deviceCount: userDevices.get(user.id)?.length || 0,
      isBlocked: user.isBlocked || false,
      deviceLimit: user.deviceLimit || 5,
      expiryDate: user.expiryDate || null
    }));

    res.json({
      users: enhancedUsers,
      total: enhancedUsers.length,
      activeUsers: enhancedUsers.filter((u: any) => !u.isBlocked).length,
      blockedUsers: enhancedUsers.filter((u: any) => u.isBlocked).length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get pending users for approval
router.get('/api/admin/pending-users', requireAdmin, (req, res) => {
  try {
    // Get pending users from localStorage equivalent (file)
    const pendingUsersFile = path.join(process.cwd(), 'pending_users.json');
    let pendingUsers = [];
    
    if (fs.existsSync(pendingUsersFile)) {
      const data = fs.readFileSync(pendingUsersFile, 'utf8');
      pendingUsers = JSON.parse(data);
    }

    res.json({
      users: pendingUsers,
      total: pendingUsers.length
    });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

// Update user
router.put('/api/admin/users/:userId', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user with new data
    users[userIndex] = { ...users[userIndex], ...updates };
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    // Log activity
    logUserActivity(userId, 'profile_updated', 'Admin updated user profile', req);

    res.json({ 
      message: 'User updated successfully', 
      user: users[userIndex] 
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Block/Unblock user
router.patch('/api/admin/users/:userId/block', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { isBlocked } = req.body;
    
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].isBlocked = isBlocked;
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    // Log activity
    logUserActivity(userId, isBlocked ? 'blocked' : 'unblocked', 
      `User ${isBlocked ? 'blocked' : 'unblocked'} by admin`, req);

    // Clear user sessions if blocked
    if (isBlocked) {
      userSessions.delete(userId);
      userDevices.delete(userId);
    }

    res.json({ 
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      user: users[userIndex]
    });
  } catch (error) {
    console.error('Error blocking/unblocking user:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Delete user
router.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = users[userIndex];
    users.splice(userIndex, 1);
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    // Clean up user data
    userSessions.delete(userId);
    userDevices.delete(userId);
    userActivity.delete(userId);

    res.json({ 
      message: 'User deleted successfully',
      deletedUser: { id: deletedUser.id, name: deletedUser.name, email: deletedUser.email }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Set user expiry date
router.patch('/api/admin/users/:userId/expiry', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { expiryDate } = req.body;
    
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].expiryDate = expiryDate;
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    // Log activity
    logUserActivity(userId, 'expiry_updated', 
      `User expiry date set to ${expiryDate}`, req);

    res.json({ 
      message: 'User expiry date updated successfully',
      user: users[userIndex]
    });
  } catch (error) {
    console.error('Error updating user expiry:', error);
    res.status(500).json({ error: 'Failed to update user expiry' });
  }
});

// Set device limit
router.patch('/api/admin/users/:userId/device-limit', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { deviceLimit } = req.body;
    
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].deviceLimit = parseInt(deviceLimit) || 5;
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    // Log activity
    logUserActivity(userId, 'device_limit_updated', 
      `Device limit set to ${deviceLimit}`, req);

    res.json({ 
      message: 'Device limit updated successfully',
      user: users[userIndex]
    });
  } catch (error) {
    console.error('Error updating device limit:', error);
    res.status(500).json({ error: 'Failed to update device limit' });
  }
});

// Get user activity
router.get('/api/admin/users/:userId/activity', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const activities = userActivity.get(userId) || [];
    
    res.json({
      userId,
      activities: activities.slice(-50) // Last 50 activities
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// Get all user activity (system-wide)
router.get('/api/admin/activity', requireAdmin, (req, res) => {
  try {
    const allActivities: any[] = [];
    
    userActivity.forEach((activities, userId) => {
      activities.forEach((activity: any) => {
        allActivities.push({
          ...activity,
          userId
        });
      });
    });
    
    // Sort by timestamp descending
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    res.json({
      activities: allActivities.slice(0, 100), // Last 100 activities
      total: allActivities.length
    });
  } catch (error) {
    console.error('Error fetching system activity:', error);
    res.status(500).json({ error: 'Failed to fetch system activity' });
  }
});

// Export users data
router.get('/api/admin/export/users', requireAdmin, (req, res) => {
  try {
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    // Remove sensitive data before export
    const exportData = users.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city,
      whatsappNumber: user.whatsappNumber,
      createdAt: user.createdAt,
      isBlocked: user.isBlocked || false,
      expiryDate: user.expiryDate || null,
      deviceLimit: user.deviceLimit || 5
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 
      `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.json`);
    
    res.json({
      exportDate: new Date().toISOString(),
      totalUsers: exportData.length,
      users: exportData
    });
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

// Import users data
router.post('/api/admin/import/users', requireAdmin, (req, res) => {
  try {
    const { users: importedUsers } = req.body;
    
    if (!Array.isArray(importedUsers)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    const usersFile = path.join(process.cwd(), 'users.json');
    let existingUsers = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      existingUsers = JSON.parse(data);
    }

    // Merge imported users with existing ones
    const emailMap = new Map(existingUsers.map((u: any) => [u.email, u]));
    let newUsers = 0;
    let updatedUsers = 0;

    importedUsers.forEach((importedUser: any) => {
      if (emailMap.has(importedUser.email)) {
        // Update existing user
        const existingIndex = existingUsers.findIndex((u: any) => u.email === importedUser.email);
        existingUsers[existingIndex] = { ...existingUsers[existingIndex], ...importedUser };
        updatedUsers++;
      } else {
        // Add new user
        existingUsers.push({
          ...importedUser,
          id: importedUser.id || nanoid(),
          createdAt: importedUser.createdAt || new Date().toISOString()
        });
        newUsers++;
      }
    });
    
    // Save back to file
    fs.writeFileSync(usersFile, JSON.stringify(existingUsers, null, 2));

    res.json({
      message: 'Users imported successfully',
      newUsers,
      updatedUsers,
      totalUsers: existingUsers.length
    });
  } catch (error) {
    console.error('Error importing users:', error);
    res.status(500).json({ error: 'Failed to import users' });
  }
});

// Get system statistics
router.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const usersFile = path.join(process.cwd(), 'users.json');
    let users = [];
    
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
    }

    // Get pending users count
    const pendingUsersFile = path.join(process.cwd(), 'pending_users.json');
    let pendingUsers = [];
    
    if (fs.existsSync(pendingUsersFile)) {
      const data = fs.readFileSync(pendingUsersFile, 'utf8');
      pendingUsers = JSON.parse(data);
    }

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter((u: any) => !u.isBlocked).length,
      blockedUsers: users.filter((u: any) => u.isBlocked).length,
      expiredUsers: users.filter((u: any) => 
        u.expiryDate && new Date(u.expiryDate) < new Date()
      ).length,
      pendingUsers: pendingUsers.length,
      totalSessions: userSessions.size,
      totalDevices: Array.from(userDevices.values()).reduce((sum, devices) => sum + devices.length, 0),
      recentRegistrations: users.filter((u: any) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(u.createdAt) > weekAgo;
      }).length
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Helper function to log user activity
function logUserActivity(userId: string, action: string, details: string, req: any) {
  if (!userActivity.has(userId)) {
    userActivity.set(userId, []);
  }
  
  const activities = userActivity.get(userId);
  activities.push({
    id: nanoid(),
    action,
    details,
    timestamp: new Date().toISOString(),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  });
  
  // Keep only last 100 activities per user
  if (activities.length > 100) {
    activities.splice(0, activities.length - 100);
  }
}

// Device tracking endpoints
router.post('/api/admin/track-device', (req, res) => {
  try {
    const { userId, deviceInfo } = req.body;
    
    if (!userDevices.has(userId)) {
      userDevices.set(userId, []);
    }
    
    const devices = userDevices.get(userId);
    const deviceId = `${deviceInfo.browser}_${deviceInfo.os}_${req.ip}`;
    
    // Check if device already exists
    const existingDevice = devices.find((d: any) => d.id === deviceId);
    if (!existingDevice) {
      devices.push({
        id: deviceId,
        ...deviceInfo,
        ipAddress: req.ip,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
      
      logUserActivity(userId, 'new_device', `New device registered: ${deviceInfo.browser} on ${deviceInfo.os}`, req);
    } else {
      existingDevice.lastSeen = new Date().toISOString();
    }
    
    res.json({ success: true, deviceCount: devices.length });
  } catch (error) {
    console.error('Error tracking device:', error);
    res.status(500).json({ error: 'Failed to track device' });
  }
});

export default router;