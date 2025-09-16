import { AnalysisCard } from "./AnalysisCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MapPin, Route, Building, ExpandIcon, Clock, Users, Phone, MessageSquare, Navigation, Eye, Search, TrendingUp, TrendingDown, Calendar, PhoneIncoming, PhoneOutgoing, Send, Download } from "lucide-react";
import { type LocationAnalysisResult, type LocationMovementResult, type LocationChangeResult } from "@/lib/types";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface LocationAnalysisProps {
  locationData: LocationAnalysisResult[];
  movementData: LocationMovementResult[];
  detailedTimeline?: LocationChangeResult[];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getMobilityColor(level: string): string {
  switch (level) {
    case 'high': return 'bg-danger text-white';
    case 'medium': return 'bg-accent text-white';
    case 'low': return 'bg-warning text-gray-90';
    default: return 'bg-gray-30 text-gray-90';
  }
}

function formatCallType(callType: string): string {
  switch (callType) {
    case 'call_incoming': return 'Incoming Call';
    case 'call_outgoing': return 'Outgoing Call';
    case 'sms_received': return 'Incoming SMS';
    case 'sms_sent': return 'Outgoing SMS';
    default: return callType;
  }
}

function getCallTypeColor(callType: string): string {
  switch (callType) {
    case 'call_incoming': return 'text-accent bg-accent/10 border-accent';
    case 'call_outgoing': return 'text-primary bg-primary/10 border-primary';
    case 'sms_received': return 'text-purple-700 bg-purple-100 border-purple-400';
    case 'sms_sent': return 'text-orange-700 bg-orange-100 border-orange-400';
    default: return 'text-gray-70 bg-gray-10 border-gray-30';
  }
}

export function LocationAnalysis({ locationData, movementData, detailedTimeline }: LocationAnalysisProps) {
  const [selectedDetails, setSelectedDetails] = useState<any[] | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [searchNumber, setSearchNumber] = useState('');
  const [numberSearchResults, setNumberSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDetails, setIsExportingDetails] = useState(false);

  const searchNumberAnalysis = async (number: string) => {
    if (!number.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/number-analysis/${encodeURIComponent(number.trim())}`);
      const data = await response.json();
      setNumberSearchResults(data);
    } catch (error) {
      console.error('Number analysis failed:', error);
      setNumberSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const exportLocationTimeline = async () => {
    if (!detailedTimeline || detailedTimeline.length === 0) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/export-location-timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeline: detailedTimeline,
          totalChanges: detailedTimeline.length
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `location-timeline-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportDetailedRecords = async () => {
    if (!selectedDetails || selectedDetails.length === 0) return;
    
    setIsExportingDetails(true);
    try {
      const response = await fetch('/api/export-detailed-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: selectedDetails,
          totalRecords: selectedDetails.length,
          location: selectedLocation
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const locationName = selectedLocation ? selectedLocation.split(',')[0].replace(/[^a-zA-Z0-9]/g, '-') : 'location';
        a.download = `detailed-records-${locationName}-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExportingDetails(false);
    }
  };
  
  return (
    <AnalysisCard
      title="Detailed Location Timeline & Communication Analysis"  
      icon={<Navigation className="w-5 h-5" />}
      action={null}
    >

      {/* Export Button for All Data */}
      {detailedTimeline && detailedTimeline.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={exportLocationTimeline}
            disabled={isExporting}
            size="sm"
            variant="outline"
            className="text-xs"
            data-testid="export-all-timeline"
          >
            <Download className="w-3 h-3 mr-1" />
            {isExporting ? 'Exporting...' : 'Export All Timeline Data'}
          </Button>
        </div>
      )}

      {/* Enhanced Detailed Timeline */}
      {detailedTimeline && detailedTimeline.length > 0 ? (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {detailedTimeline.slice(0, 15).map((change, index) => (
            <div 
              key={`${change.subscriber}-${change.changeTime}-${index}`}
              className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border-l-4 border-primary"
              data-testid={`timeline-${index}`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <p className="text-xs font-medium text-gray-90">
                    {new Date(change.changeTime).toLocaleString('en-US', {
                      month: 'short', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </p>
                  <div className="flex items-center gap-1 text-xs">
                    <MapPin className="w-3 h-3 text-gray-60" />
                    <span className="text-gray-70">{change.fromLocation}</span>
                    <span className="text-primary">→</span>
                    <span className="text-primary font-medium">{change.toLocation}</span>
                  </div>
                </div>
                <span className="bg-primary text-white px-2 py-1 rounded text-xs">
                  {change.activityInNewLocation.stayDuration}
                </span>
              </div>

              {/* Compact Activity & Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Activity Stats */}
                <div className="bg-white/60 rounded p-2">
                  <div className="text-xs font-medium text-gray-70 mb-1">Activity</div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    <div>
                      <div className="font-bold text-accent">{change.activityInNewLocation.incomingCalls}</div>
                      <div className="text-gray-60">In Call</div>
                    </div>
                    <div>
                      <div className="font-bold text-primary">{change.activityInNewLocation.outgoingCalls}</div>
                      <div className="text-gray-60">Out Call</div>
                    </div>
                    <div>
                      <div className="font-bold text-purple-600">{change.activityInNewLocation.incomingSms}</div>
                      <div className="text-gray-60">In SMS</div>
                    </div>
                    <div>
                      <div className="font-bold text-orange-600">{change.activityInNewLocation.outgoingSms}</div>
                      <div className="text-gray-60">Out SMS</div>
                    </div>
                  </div>
                </div>

                {/* Contact Numbers */}
                <div className="bg-white/60 rounded p-2">
                  <div className="text-xs font-medium text-gray-70 mb-1">Contact Numbers</div>
                  <div className="space-y-1 text-xs">
                    {change.activityInNewLocation.incomingCallNumbers.length > 0 && (
                      <div>
                        <span className="text-accent font-medium">In Calls: </span>
                        <span className="font-mono text-gray-70">{change.activityInNewLocation.incomingCallNumbers.join(', ')}</span>
                        {change.activityInNewLocation.totalCallNumbers > change.activityInNewLocation.incomingCallNumbers.length && (
                          <span className="text-gray-50"> +{change.activityInNewLocation.totalCallNumbers - change.activityInNewLocation.incomingCallNumbers.length} more</span>
                        )}
                      </div>
                    )}
                    {change.activityInNewLocation.outgoingCallNumbers.length > 0 && (
                      <div>
                        <span className="text-primary font-medium">Out Calls: </span>
                        <span className="font-mono text-gray-70">{change.activityInNewLocation.outgoingCallNumbers.join(', ')}</span>
                      </div>
                    )}
                    {change.activityInNewLocation.incomingSmsNumbers.length > 0 && (
                      <div>
                        <span className="text-purple-600 font-medium">In SMS: </span>
                        <span className="font-mono text-gray-70">{change.activityInNewLocation.incomingSmsNumbers.join(', ')}</span>
                      </div>
                    )}
                    {change.activityInNewLocation.outgoingSmsNumbers.length > 0 && (
                      <div>
                        <span className="text-orange-600 font-medium">Out SMS: </span>
                        <span className="font-mono text-gray-70">{change.activityInNewLocation.outgoingSmsNumbers.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Summary & Details Button */}
              <div className="mt-2 pt-2 border-t border-white/50 flex justify-between items-center">
                <div className="text-xs text-gray-70 flex gap-4">
                  <span><strong>Duration:</strong> {formatDuration(change.activityInNewLocation.totalDuration)}</span>
                  <span><strong>Contacts:</strong> {change.activityInNewLocation.uniqueContacts}</span>
                  <span><strong>Top:</strong> {change.activityInNewLocation.topContactedNumber || 'None'} ({change.activityInNewLocation.topContactCount}x)</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setSelectedDetails(change.activityInNewLocation.detailedRecords);
                    setSelectedLocation(change.toLocation);
                  }}
                  data-testid={`details-${index}`}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Details
                </Button>
              </div>
            </div>
          ))}
          
          {detailedTimeline.length > 15 && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-60">
                Showing 15 recent changes • {detailedTimeline.length} total changes
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-60">
          <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No location changes detected in the data</p>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={!!selectedDetails} onOpenChange={(open) => {
        if (!open) {
          setSelectedDetails(null);
          setSelectedLocation(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Location Communication Details
              </div>
              {selectedDetails && selectedDetails.length > 0 && (
                <Button
                  onClick={exportDetailedRecords}
                  disabled={isExportingDetails}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  data-testid="export-detailed-records"
                >
                  <Download className="w-3 h-3 mr-1" />
                  {isExportingDetails ? 'Exporting...' : 'Export Details'}
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto max-h-[60vh] space-y-2">
            {selectedDetails && selectedDetails.length > 0 ? (
              <div className="space-y-2">
                {selectedDetails
                  .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((record: any, index: number) => (
                  <div 
                    key={`${record.timestamp}-${index}`}
                    className={`border rounded-lg p-3 ${getCallTypeColor(record.callType)}`}
                    data-testid={`record-${index}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {record.callType.includes('call') ? (
                            <Phone className="w-4 h-4" />
                          ) : (
                            <MessageSquare className="w-4 h-4" />
                          )}
                          <span className="font-medium text-sm">
                            {formatCallType(record.callType)}
                          </span>
                          <span className="font-mono text-sm font-bold">
                            {record.number || 'Unknown'}
                          </span>
                        </div>
                        
                        <div className="text-xs opacity-80">
                          {new Date(record.timestamp).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                      
                      {record.duration > 0 && (
                        <div className="text-right">
                          <div className="font-bold text-sm">{formatDuration(record.duration)}</div>
                          <div className="text-xs opacity-80">Duration</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-60">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No detailed records available</p>
              </div>
            )}
          </div>
          
          {selectedDetails && selectedDetails.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-gray-60 text-center pt-2 border-t">
                Total Records: {selectedDetails.length} • 
                Calls: {selectedDetails.filter((r: any) => r.callType.includes('call')).length} • 
                SMS: {selectedDetails.filter((r: any) => r.callType.includes('sms')).length}
              </div>

              {/* Number Search Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Search className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Analyze Specific Number (90 Days)</span>
                </div>
                
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="Enter phone number to analyze..."
                    value={searchNumber}
                    onChange={(e) => setSearchNumber(e.target.value)}
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && searchNumberAnalysis(searchNumber)}
                  />
                  <Button 
                    onClick={() => searchNumberAnalysis(searchNumber)}
                    disabled={isSearching || !searchNumber.trim()}
                    size="sm"
                  >
                    {isSearching ? 'Analyzing...' : 'Analyze'}
                  </Button>
                </div>

                {/* Search Results */}
                {numberSearchResults && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="font-mono font-bold">{numberSearchResults.number}</span>
                      <span className="text-sm text-gray-60">• 90-Day Analysis</span>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="text-center bg-white rounded p-2">
                        <div className="font-bold text-primary">{numberSearchResults.totalDays}</div>
                        <div className="text-xs text-gray-60">Active Days</div>
                      </div>
                      <div className="text-center bg-white rounded p-2">
                        <div className="font-bold text-accent">{numberSearchResults.totalCalls}</div>
                        <div className="text-xs text-gray-60">Total Calls</div>
                      </div>
                      <div className="text-center bg-white rounded p-2">
                        <div className="font-bold text-purple-600">{numberSearchResults.totalSms}</div>
                        <div className="text-xs text-gray-60">Total SMS</div>
                      </div>
                      <div className="text-center bg-white rounded p-2">
                        <div className="font-bold text-orange-600">{Math.round(numberSearchResults.avgPerDay)}</div>
                        <div className="text-xs text-gray-60">Avg/Day</div>
                      </div>
                    </div>

                    {/* Most/Least Active Days */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Most Active Day */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-green-800">Most Active Day</span>
                        </div>
                        <div className="text-sm">
                          <div className="font-bold text-green-900">{numberSearchResults.mostActiveDay?.date}</div>
                          <div className="text-green-700 mt-1">
                            {numberSearchResults.mostActiveDay?.calls} calls • {numberSearchResults.mostActiveDay?.sms} SMS
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            Duration: {formatDuration(numberSearchResults.mostActiveDay?.duration || 0)}
                          </div>
                        </div>
                      </div>

                      {/* Least Active Day */}
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="w-4 h-4 text-orange-600" />
                          <span className="font-medium text-orange-800">Least Active Day</span>
                        </div>
                        <div className="text-sm">
                          <div className="font-bold text-orange-900">{numberSearchResults.leastActiveDay?.date}</div>
                          <div className="text-orange-700 mt-1">
                            {numberSearchResults.leastActiveDay?.calls} calls • {numberSearchResults.leastActiveDay?.sms} SMS
                          </div>
                          <div className="text-xs text-orange-600 mt-1">
                            Duration: {formatDuration(numberSearchResults.leastActiveDay?.duration || 0)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Daily Details - Scrollable */}
                    {numberSearchResults.dailyBreakdown && numberSearchResults.dailyBreakdown.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="w-4 h-4 text-gray-60" />
                          <span className="font-medium text-sm">Daily Breakdown ({numberSearchResults.dailyBreakdown.length} days)</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {numberSearchResults.dailyBreakdown
                            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((day: any, index: number) => (
                            <div key={`${day.date}-${index}`} className="bg-white border rounded p-3 text-sm">
                              <div className="flex justify-between items-start mb-2">
                                <div className="font-medium">{new Date(day.date).toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}</div>
                                <div className="text-xs text-gray-60">Total: {day.calls + day.sms}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="text-accent font-medium">{day.calls}</span>
                                  <span className="text-gray-60"> calls</span>
                                </div>
                                <div>
                                  <span className="text-purple-600 font-medium">{day.sms}</span>
                                  <span className="text-gray-60"> SMS</span>
                                </div>
                                <div>
                                  <span className="text-primary font-medium">{formatDuration(day.duration)}</span>
                                  <span className="text-gray-60"> talk</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {numberSearchResults === null && searchNumber && !isSearching && (
                  <div className="text-center py-4 text-gray-60">
                    <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No data found for this number</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </AnalysisCard>
  );
}
