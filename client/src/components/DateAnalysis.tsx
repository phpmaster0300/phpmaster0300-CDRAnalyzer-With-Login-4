import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, MessageSquare, Clock, MapPin, Smartphone, Download } from "lucide-react";

interface DateAnalysisProps {
  uploadId: string;
}

interface ActivityRecord {
  time: string;
  type: string;
  caller: string;
  called: string;
  duration: number;
  location: string;
  imei: string;
}

interface DateAnalysisData {
  date: string;
  activities: {
    outgoingCalls: any[];
    incomingCalls: any[];
    outgoingSMS: any[];
    incomingSMS: any[];
    totalActivities: number;
  };
  timeline: ActivityRecord[];
}

const DateAnalysis = ({ uploadId }: DateAnalysisProps) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<DateAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDateAnalysis = async () => {
    if (!selectedDate) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/date-analysis/${uploadId}/${selectedDate}`);
      if (!response.ok) throw new Error('Analysis failed');
      const data = await response.json();
      setAnalysisData(data);
    } catch (error) {
      console.error('Date analysis error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call_outgoing':
        return <Phone className="w-4 h-4 text-blue-600" />;
      case 'call_incoming':
        return <Phone className="w-4 h-4 text-green-600" />;
      case 'sms_sent':
        return <MessageSquare className="w-4 h-4 text-orange-600" />;
      case 'sms_received':
        return <MessageSquare className="w-4 h-4 text-purple-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'call_outgoing': return 'Outgoing Call';
      case 'call_incoming': return 'Incoming Call';
      case 'sms_sent': return 'SMS Sent';
      case 'sms_received': return 'SMS Received';
      default: return type;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'call_outgoing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'call_incoming': return 'bg-green-100 text-green-800 border-green-200';
      case 'sms_sent': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'sms_received': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card className="w-full" data-testid="card-date-analysis">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-primary" />
          Daily Activity Analysis
        </CardTitle>
        <CardDescription>
          Select a specific date to view detailed timeline of all calls and SMS activities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Picker */}
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-70 mb-2 block">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-30 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              data-testid="input-date-picker"
            />
          </div>
          <div className="pt-6">
            <Button
              onClick={handleDateAnalysis}
              disabled={!selectedDate || loading}
              className="bg-primary hover:bg-blue-600 text-white"
              data-testid="button-analyze-date"
            >
              {loading ? "Analyzing..." : "Analyze Date"}
            </Button>
          </div>
        </div>

        {/* Results */}
        {analysisData && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <Phone className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-blue-800">
                  {analysisData.activities.outgoingCalls.length}
                </div>
                <div className="text-sm text-blue-600">Outgoing Calls</div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <Phone className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-green-800">
                  {analysisData.activities.incomingCalls.length}
                </div>
                <div className="text-sm text-green-600">Incoming Calls</div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                <MessageSquare className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-orange-800">
                  {analysisData.activities.outgoingSMS.length}
                </div>
                <div className="text-sm text-orange-600">SMS Sent</div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                <MessageSquare className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-purple-800">
                  {analysisData.activities.incomingSMS.length}
                </div>
                <div className="text-sm text-purple-600">SMS Received</div>
              </div>
            </div>

            {/* Timeline */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-10 px-6 py-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-90">
                      Complete Activity Timeline - {new Date(analysisData.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long', 
                        day: 'numeric'
                      })}
                    </h3>
                    <p className="text-sm text-gray-60 mt-1">
                      Total Activities: {analysisData.activities.totalActivities}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/export-date-analysis', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            date: analysisData.date,
                            activities: analysisData.activities,
                            timeline: analysisData.timeline
                          })
                        });
                        
                        if (response.ok) {
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `daily-analysis-${analysisData.date}.html`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        } else {
                          console.error('Export failed');
                        }
                      } catch (error) {
                        console.error('Export error:', error);
                      }
                    }}
                    className="text-xs flex items-center"
                    data-testid="button-export-daily-analysis"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export HTML
                  </Button>
                </div>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {analysisData.timeline.length > 0 ? (
                  <div className="divide-y divide-gray-20">
                    {analysisData.timeline.map((activity, index) => (
                      <div key={index} className="px-6 py-4 hover:bg-gray-10">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0 mt-1">
                            {getActivityIcon(activity.type)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <Badge className={`${getActivityColor(activity.type)} text-xs`}>
                                {getActivityLabel(activity.type)}
                              </Badge>
                              <span className="text-sm font-medium text-gray-90">
                                {formatTime(activity.time)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-70">
                              <div>
                                <span className="font-medium">From: </span>
                                <span className="text-gray-90">{activity.caller}</span>
                              </div>
                              <div>
                                <span className="font-medium">To: </span>
                                <span className="text-gray-90">{activity.called}</span>
                              </div>
                              <div>
                                <span className="font-medium">Duration: </span>
                                <span className="text-gray-90">{formatDuration(activity.duration)}</span>
                              </div>
                            </div>
                            
                            {activity.location && (
                              <div className="flex items-center mt-2 text-xs text-gray-60">
                                <MapPin className="w-3 h-3 mr-1" />
                                {activity.location}
                                {activity.imei && (
                                  <>
                                    <Smartphone className="w-3 h-3 ml-3 mr-1" />
                                    {activity.imei.substring(0, 8)}...
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-60">
                    No activities found for the selected date
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DateAnalysis;