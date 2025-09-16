import { useState, useMemo } from "react";
import { FileUpload } from "@/components/FileUpload";
import { AnalysisCard } from "@/components/AnalysisCard";
import { TopNumbersTable } from "@/components/TopNumbersTable";
import { LocationAnalysis } from "@/components/LocationAnalysis";
import { IMEIAnalysis } from "@/components/IMEIAnalysis";
import DateAnalysis from "@/components/DateAnalysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileText, Download, ChartLine, User, Search, Phone, TrendingUp, TrendingDown, Calendar, PhoneIncoming, PhoneOutgoing, Send, MessageSquare, Edit, Lock, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { type AnalysisData } from "@/lib/types";

export default function Dashboard() {
  const { user, logout, updateProfile } = useAuth();
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [searchNumber, setSearchNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [numberSearchResults, setNumberSearchResults] = useState<any>(null);
  const [isExportingNumber, setIsExportingNumber] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    currentPassword: '',
    password: '',
    confirmPassword: ''
  });
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Check if current user is admin
  const isAdmin = user?.isAdmin || false;

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['/api/analysis', uploadId],
    enabled: !!uploadId && !analysisData,
  });

  const handleUploadSuccess = (data: { uploadId: string; analysis: AnalysisData }) => {
    setUploadId(data.uploadId);
    setAnalysisData(data.analysis);
  };

  // Format duration utility function
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Search number analysis function
  const searchNumberAnalysis = async (number: string) => {
    if (!number.trim()) return;
    
    setIsSearching(true);
    setNumberSearchResults(null);
    
    try {
      // Add cache-busting parameter to force fresh data
      const cacheBuster = Date.now();
      const response = await fetch(`/api/number-analysis/${encodeURIComponent(number.trim())}?t=${cacheBuster}`);
      const data = await response.json();
      setNumberSearchResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Export number analysis function
  const exportNumberAnalysis = async () => {
    if (!numberSearchResults) return;
    
    setIsExportingNumber(true);
    try {
      const response = await fetch('/api/export-number-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numberData: numberSearchResults
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `number-analysis-${numberSearchResults.number}-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export Complete",
          description: `Number analysis for ${numberSearchResults.number} has been exported successfully`,
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export number analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExportingNumber(false);
    }
  };

  const handleExportHTML = async () => {
    if (!uploadId || !analysisData) return;
    
    try {
      const response = await fetch('/api/export-complete-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uploadId,
          analysisData: {
            topOutgoingCalls: analysisData.topOutgoingCalls,
            topIncomingCalls: analysisData.topIncomingCalls,
            topOutgoingSms: analysisData.topOutgoingSMS,
            topIncomingSms: analysisData.topIncomingSMS,
            topTalkTime: analysisData.topTalkTimeNumbers || analysisData.topTalkTime,
            topOutgoingTalkTime: analysisData.topOutgoingTalkTime || [],
            topIncomingTalkTime: analysisData.topIncomingTalkTime || [],
            summaryStats: {
              totalCalls: analysisData.totalCalls,
              totalSms: analysisData.totalSms,
              totalDuration: analysisData.totalDuration,
              uniqueNumbers: analysisData.uniqueNumbers
            }
          }
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `CDR-Complete-Analysis-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "Complete analysis has been exported successfully",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export analysis. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleProfileUpdate = () => {
    if (!user) return;
    
    // Validate current password
    if (profileData.currentPassword && user.password !== profileData.currentPassword) {
      toast({
        title: "Password Error",
        description: "Current password is incorrect",
        variant: "destructive"
      });
      return;
    }
    
    // Validate new passwords if provided
    if (profileData.password && profileData.password !== profileData.confirmPassword) {
      toast({
        title: "Password Error",
        description: "New passwords do not match",
        variant: "destructive"
      });
      return;
    }
    
    // If changing password, current password is required
    if ((profileData.password || profileData.confirmPassword) && !profileData.currentPassword) {
      toast({
        title: "Password Error",
        description: "Current password is required to change password",
        variant: "destructive"
      });
      return;
    }
    
    // Create updated user object
    const updatedUser = {
      ...user,
      name: profileData.name || user.name,
      password: profileData.password || user.password
    };
    
    // Update profile
    updateProfile(updatedUser);
    
    // Close dialog
    setIsProfileDialogOpen(false);
    
    toast({
      title: "Profile Updated",
      description: "Your profile has been successfully updated"
    });
  };

  const openProfileDialog = () => {
    if (user) {
      setProfileData({
        name: user.name,
        currentPassword: '',
        password: '',
        confirmPassword: ''
      });
      setIsProfileDialogOpen(true);
    }
  };

  const displayedAnalysis = analysisData || analysis;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-gray-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <ChartLine className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-90">CDR Intelligence Analyst</h1>
              <p className="text-sm text-gray-60">Call Detail Record Analysis Dashboard</p>
              <p className="text-xs text-primary font-bold">Developed by KALEEM ULLAH GOPANG</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAdmin && (
              <Button 
                onClick={() => setLocation('/admin')} 
                variant="outline"
                className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
              >
                <User className="w-4 h-4 mr-2" />
                Admin Panel
              </Button>
            )}
            {displayedAnalysis && (
              <Button 
                onClick={handleExportHTML} 
                className="bg-accent hover:bg-green-600 text-white"
                data-testid="button-export-html"
              >
                <Download className="w-4 h-4 mr-2" />
                Export HTML
              </Button>
            )}
            
            <div className="flex items-center space-x-3">
              <div className="flex flex-col items-end">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-gray-900">{user?.name}</span>
                </div>
                {user?.expiryDate && (
                  <span className="text-xs text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    Expires: {new Date(user.expiryDate).toLocaleDateString()}
                  </span>
                )}
                <div className="flex space-x-2 mt-1">
                  <Button 
                    onClick={() => setIsProfileDialogOpen(true)}
                    variant="outline" 
                    className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 flex items-center gap-1 h-7 text-xs px-2"
                  >
                    <Lock className="w-3 h-3" />
                    Change Password
                  </Button>
                  <Button 
                    onClick={logout}
                    variant="outline" 
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600 flex items-center gap-1 h-7 text-xs px-2"
                  >
                    <LogOut className="w-3 h-3" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* File Upload - Hide when analysis is available */}
        {!displayedAnalysis && (
          <div className="mb-8">
            <FileUpload onUploadSuccess={handleUploadSuccess} />
          </div>
        )}

        {/* Analysis Dashboard */}
        {displayedAnalysis && (
          <div className="space-y-8" data-testid="analysis-dashboard">
            {/* Upload New File Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">CDR Analysis Results</h2>
              <button
                onClick={() => {
                  setAnalysisData(null);
                  setUploadId(null);
                  setNumberSearchResults(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                data-testid="button-upload-new"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Upload New File
              </button>
            </div>
            {/* File Information */}
            <AnalysisCard
              title="File Information"
              icon={<FileText className="w-5 h-5" />}
              status="Processed"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary" data-testid="text-total-records">
                    {displayedAnalysis.fileStats.totalRecords.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-60">Total Records</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-accent" data-testid="text-unique-numbers">
                    {displayedAnalysis.fileStats.uniqueNumbers.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-60">Unique Numbers</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-warning" data-testid="text-date-range">
                    {displayedAnalysis.fileStats.dateRange}
                  </p>
                  <p className="text-sm text-gray-60">Date Range</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-danger" data-testid="text-processing-time">
                    {displayedAnalysis.fileStats.processingTime}
                  </p>
                  <p className="text-sm text-gray-60">Processing Time</p>
                </div>
              </div>
            </AnalysisCard>

            {/* Number Search Section */}
            <AnalysisCard
              title="90-Day Number Analysis"
              icon={<Search className="w-5 h-5" />}
            >
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter phone number to analyze (e.g., 923001234567)..."
                    value={searchNumber}
                    onChange={(e) => setSearchNumber(e.target.value)}
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && searchNumberAnalysis(searchNumber)}
                  />
                  <Button 
                    onClick={() => searchNumberAnalysis(searchNumber)}
                    disabled={isSearching || !searchNumber.trim()}
                  >
                    {isSearching ? 'Analyzing...' : 'Analyze'}
                  </Button>
                </div>

                {/* Search Results */}
                {numberSearchResults && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="font-mono font-bold text-lg">{numberSearchResults.number}</span>
                        <span className="text-sm text-gray-60">• 90-Day Complete Analysis</span>
                      </div>
                      <Button
                        onClick={exportNumberAnalysis}
                        disabled={isExportingNumber}
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        data-testid="button-export-number"
                      >
                        <Download className="w-4 h-4" />
                        {isExportingNumber ? 'Exporting...' : 'Export Analysis'}
                      </Button>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="text-center bg-white rounded-lg p-3 shadow-sm">
                        <div className="font-bold text-xl text-primary">{numberSearchResults.totalDays}</div>
                        <div className="text-sm text-gray-60">Active Days</div>
                      </div>
                      <div className="text-center bg-white rounded-lg p-3 shadow-sm">
                        <div className="font-bold text-xl text-accent">{numberSearchResults.totalCalls}</div>
                        <div className="text-sm text-gray-60">Total Calls</div>
                      </div>
                      <div className="text-center bg-white rounded-lg p-3 shadow-sm">
                        <div className="font-bold text-xl text-purple-600">{numberSearchResults.totalSms}</div>
                        <div className="text-sm text-gray-60">Total SMS</div>
                      </div>
                      <div className="text-center bg-white rounded-lg p-3 shadow-sm">
                        <div className="font-bold text-xl text-orange-600">{Math.round(numberSearchResults.avgPerDay)}</div>
                        <div className="text-sm text-gray-60">Avg/Day</div>
                      </div>
                    </div>

                    {/* Most/Least Active Days */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Most Active Day */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-green-800">Most Active Day</span>
                        </div>
                        <div className="text-sm">
                          <div className="font-bold text-lg text-green-900">{numberSearchResults.mostActiveDay?.date}</div>
                          <div className="text-green-700 mt-2">
                            <div className="flex gap-4">
                              <span><strong>{numberSearchResults.mostActiveDay?.calls}</strong> calls</span>
                              <span><strong>{numberSearchResults.mostActiveDay?.sms}</strong> SMS</span>
                            </div>
                            <div className="text-sm text-green-600 mt-1">
                              Duration: <strong>{formatDuration(numberSearchResults.mostActiveDay?.duration || 0)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Least Active Day */}
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="w-5 h-5 text-orange-600" />
                          <span className="font-medium text-orange-800">Least Active Day</span>
                        </div>
                        <div className="text-sm">
                          <div className="font-bold text-lg text-orange-900">{numberSearchResults.leastActiveDay?.date}</div>
                          <div className="text-orange-700 mt-2">
                            <div className="flex gap-4">
                              <span><strong>{numberSearchResults.leastActiveDay?.calls}</strong> calls</span>
                              <span><strong>{numberSearchResults.leastActiveDay?.sms}</strong> SMS</span>
                            </div>
                            <div className="text-sm text-orange-600 mt-1">
                              Duration: <strong>{formatDuration(numberSearchResults.leastActiveDay?.duration || 0)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Daily Details - Scrollable */}
                    {numberSearchResults.dailyBreakdown && numberSearchResults.dailyBreakdown.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="w-5 h-5 text-gray-60" />
                          <span className="font-medium">Daily Breakdown ({numberSearchResults.dailyBreakdown.length} days)</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-2 border border-gray-20 rounded-lg p-2">
                          {numberSearchResults.dailyBreakdown
                            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((day: any, index: number) => (
                            <div key={`${day.date}-${index}`} className="bg-white border border-gray-10 rounded-lg p-3">
                              <div className="flex justify-between items-start mb-3">
                                <div className="font-medium text-gray-90">
                                  {new Date(day.date).toLocaleDateString('en-US', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                                <div className="text-sm font-bold text-primary">Total: {day.calls + day.sms}</div>
                              </div>
                              
                              {/* Summary Stats */}
                              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div className="text-center">
                                  <span className="text-accent font-bold text-lg">{day.calls}</span>
                                  <div className="text-xs text-gray-60">calls</div>
                                </div>
                                <div className="text-center">
                                  <span className="text-purple-600 font-bold text-lg">{day.sms}</span>
                                  <div className="text-xs text-gray-60">SMS</div>
                                </div>
                                <div className="text-center">
                                  <span className="text-primary font-bold">{formatDuration(day.duration)}</span>
                                  <div className="text-xs text-gray-60">duration</div>
                                </div>
                              </div>

                              {/* Detailed Records */}
                              {day.records && day.records.length > 0 && (
                                <div className="border-t border-gray-10 pt-3 space-y-2">
                                  <div className="text-xs text-gray-60 font-medium mb-2">
                                    Detailed Records ({day.records.length}):
                                  </div>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {day.records
                                      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                      .map((record: any, recordIndex: number) => {
                                        const isIncoming = record.callType === 'call_incoming' || record.callType === 'sms_received';
                                        const isCall = record.callType.includes('call');
                                        // Always show the OTHER party's number, not the searched number
                                        const otherNumber = record.callerNumber === numberSearchResults.number 
                                          ? record.calledNumber 
                                          : record.callerNumber;
                                        
                                        return (
                                          <div key={`${record.timestamp}-${recordIndex}`} 
                                               className={`text-xs p-2 rounded border-l-2 ${
                                                 record.callType === 'call_incoming' ? 'bg-green-50 border-l-green-500' :
                                                 record.callType === 'call_outgoing' ? 'bg-blue-50 border-l-blue-500' :
                                                 record.callType === 'sms_received' ? 'bg-purple-50 border-l-purple-500' :
                                                 'bg-orange-50 border-l-orange-500'
                                               }`}>
                                            <div className="flex justify-between items-start">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-1 mb-1">
                                                  {record.callType === 'call_incoming' && (
                                                    <><PhoneIncoming className="w-3 h-3 text-green-600" /><span className="text-green-700 font-medium">Incoming Call</span></>
                                                  )}
                                                  {record.callType === 'call_outgoing' && (
                                                    <><PhoneOutgoing className="w-3 h-3 text-blue-600" /><span className="text-blue-700 font-medium">Outgoing Call</span></>
                                                  )}
                                                  {record.callType === 'sms_received' && (
                                                    <><MessageSquare className="w-3 h-3 text-purple-600" /><span className="text-purple-700 font-medium">SMS Received</span></>
                                                  )}
                                                  {record.callType === 'sms_sent' && (
                                                    <><Send className="w-3 h-3 text-orange-600" /><span className="text-orange-700 font-medium">SMS Sent</span></>
                                                  )}
                                                </div>
                                                <div className="font-mono text-xs text-gray-70 mb-1">
                                                  {isIncoming ? 'From: ' : 'To: '}{otherNumber || 'Unknown'}
                                                </div>
                                                <div className="text-gray-60">
                                                  <div className="flex flex-col">
                                                    <span className="font-medium">
                                                      {new Date(record.timestamp).toLocaleDateString('en-US', {
                                                        weekday: 'short',
                                                        month: 'short', 
                                                        day: 'numeric'
                                                      })}
                                                    </span>
                                                    <span className="text-xs font-bold text-blue-600">
                                                      {new Date(record.timestamp).toLocaleTimeString('en-US', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        second: '2-digit',
                                                        hour12: true
                                                      })}
                                                    </span>
                                                  </div>
                                                  {record.location && (
                                                    <div className="text-xs text-gray-50 mt-1">📍 {record.location}</div>
                                                  )}
                                                </div>
                                              </div>
                                              {isCall && record.duration > 0 && (
                                                <div className="text-right ml-2">
                                                  <div className="font-medium text-xs">{formatDuration(record.duration)}</div>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {numberSearchResults === null && searchNumber && !isSearching && (
                  <div className="text-center py-8 text-gray-60">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No data found for this number</p>
                    <p className="text-sm mt-1">Try different number format or check if number exists in CDR data</p>
                  </div>
                )}
              </div>
            </AnalysisCard>

            {/* Date Analysis */}
            <DateAnalysis uploadId={uploadId} />

            {/* Daily Breakdown - Compact */}
            <AnalysisCard
              title="Daily Communication Summary"
              icon={<ChartLine className="w-5 h-5" />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {displayedAnalysis.fileStats.dailyBreakdown.slice(-8).map((day, index) => (
                  <div key={day.date} className="bg-gray-5 rounded-lg p-3 border border-gray-10">
                    <div className="text-xs font-medium text-gray-70 mb-2" data-testid={`daily-date-compact-${index}`}>
                      {new Date(day.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center">
                        <div className="font-bold text-primary" data-testid={`daily-inc-calls-compact-${index}`}>
                          {day.incomingCalls}
                        </div>
                        <div className="text-gray-60">In Call</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-accent" data-testid={`daily-out-calls-compact-${index}`}>
                          {day.outgoingCalls}
                        </div>
                        <div className="text-gray-60">Out Call</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-warning" data-testid={`daily-inc-sms-compact-${index}`}>
                          {day.incomingSms}
                        </div>
                        <div className="text-gray-60">In SMS</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-danger" data-testid={`daily-out-sms-compact-${index}`}>
                          {day.outgoingSms}
                        </div>
                        <div className="text-gray-60">Out SMS</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {displayedAnalysis.fileStats.dailyBreakdown.length > 8 && (
                <div className="text-center mt-4">
                  <p className="text-xs text-gray-60">Showing last 8 days • {displayedAnalysis.fileStats.dailyBreakdown.length} total days</p>
                </div>
              )}
            </AnalysisCard>

            {/* Top Call Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopNumbersTable
                title="Top Outgoing Calls"
                data={displayedAnalysis.topOutgoingCalls || []}
                valueLabel="Calls"
                color="primary"
                uploadId={uploadId || undefined}
              />
              <TopNumbersTable
                title="Top Incoming Calls"
                data={displayedAnalysis.topIncomingCalls || []}
                valueLabel="Calls"
                color="accent"
                uploadId={uploadId || undefined}
              />
            </div>

            {/* SMS Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopNumbersTable
                title="Top Outgoing SMS"
                data={displayedAnalysis.topOutgoingSMS || []}
                valueLabel="SMS Sent"
                color="warning"
                uploadId={uploadId || undefined}
              />
              <TopNumbersTable
                title="Top Incoming SMS"
                data={displayedAnalysis.topIncomingSMS || []}
                valueLabel="SMS Received"
                color="danger"
                uploadId={uploadId || undefined}
              />
            </div>

            {/* Talk Time Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopNumbersTable
                title="Top Talk Time (Outgoing)"
                data={displayedAnalysis?.topOutgoingTalkTime || displayedAnalysis?.topTalkTimeNumbers || []}
                valueLabel="Talk Duration" 
                color="primary"
                uploadId={uploadId || undefined}
              />
              <TopNumbersTable
                title="Top Talk Time (Incoming)" 
                data={displayedAnalysis?.topIncomingTalkTime || []}
                valueLabel="Talk Duration"
                color="accent"
                uploadId={uploadId || undefined}
              />
            </div>

            {/* Location Analysis */}
            <LocationAnalysis 
              locationData={displayedAnalysis.locationAnalysis}
              movementData={displayedAnalysis.movementPatterns}
              detailedTimeline={displayedAnalysis.detailedLocationTimeline}
            />

            {/* IMEI Analysis */}
            <IMEIAnalysis data={displayedAnalysis.imeiChanges} />

            {/* Export Section */}
            <AnalysisCard
              title="Export Analysis Results"
              icon={<Download className="w-5 h-5" />}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-60">
                  Generate comprehensive HTML report with all Top Numbers analysis data
                </p>
                <Button 
                  onClick={handleExportHTML}
                  className="bg-primary hover:bg-blue-700 text-white px-6 py-3"
                  data-testid="button-generate-html"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate HTML Report
                </Button>
              </div>
            </AnalysisCard>
          </div>
        )}
      </main>
      
      {/* Profile Edit Dialog */}
      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information and password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={profileData.name}
                onChange={(e) => setProfileData({...profileData, name: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={profileData.currentPassword}
                onChange={(e) => setProfileData({...profileData, currentPassword: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={profileData.password}
                onChange={(e) => setProfileData({...profileData, password: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={profileData.confirmPassword}
                onChange={(e) => setProfileData({...profileData, confirmPassword: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleProfileUpdate}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}