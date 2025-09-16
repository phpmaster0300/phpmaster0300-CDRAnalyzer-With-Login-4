import { useState } from "react";
import { AnalysisCard } from "./AnalysisCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Phone, Clock, Send, Inbox, ExpandIcon, Info, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { type TopNumbersResult } from "@/lib/types";

interface TopNumbersTableProps {
  title: string;
  data: TopNumbersResult[];
  valueLabel: string;
  color: "primary" | "accent" | "warning" | "danger";
  uploadId?: string;
}

interface NumberDetailRecord {
  id: string;
  callType: string;
  otherParty: string;
  direction: string;
  duration: number;
  timestamp: string;
  location: string;
  imei: string;
  coordinates: { lat: number; lng: number } | null;
}

interface NumberDetailsResponse {
  number: string;
  totalRecords: number;
  records: NumberDetailRecord[];
}

const colorClasses = {
  primary: "text-primary",
  accent: "text-accent", 
  warning: "text-warning",
  danger: "text-danger",
};

const iconMap = {
  "Top 200 - Most Calls": Phone,
  "Top 200 - Most Talk Time": Clock,
  "Top 200 - Most SMS Sent": Send,
  "Top 200 - Most SMS Received": Inbox,
  "Top Outgoing Calls": Phone,
  "Top Incoming Calls": Phone,
  "Top Outgoing SMS": Send,
  "Top Incoming SMS": Inbox,
};

function formatCallDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

export function TopNumbersTable({ title, data, valueLabel, color, uploadId }: TopNumbersTableProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [isExportingTable, setIsExportingTable] = useState(false);
  const { toast } = useToast();
  const displayData = showAll ? data : data.slice(0, 10);
  const IconComponent = iconMap[title as keyof typeof iconMap] || Phone;

  // Show details button for calls and SMS tables
  const showDetailsButton = title.includes("Calls") || title.includes("Talk Time") || title.includes("SMS");

  // Determine call type filter based on table title
  const getCallTypeFilter = (tableTitle: string) => {
    if (tableTitle.includes("Top Outgoing Calls")) return "call_outgoing";
    if (tableTitle.includes("Top Incoming Calls")) return "call_incoming";
    if (tableTitle.includes("Top Outgoing SMS")) return "sms_sent";
    if (tableTitle.includes("Top Incoming SMS")) return "sms_received";
    return null; // For general tables like "Most Calls" or "Talk Time"
  };

  const callTypeFilter = getCallTypeFilter(title);

  const { data: numberDetails, isLoading: detailsLoading } = useQuery<NumberDetailsResponse>({
    queryKey: ['/api/number-details', uploadId, selectedNumber, callTypeFilter],
    enabled: !!uploadId && !!selectedNumber,
    queryFn: async () => {
      const url = callTypeFilter 
        ? `/api/number-details/${uploadId}/${selectedNumber}?callType=${callTypeFilter}`
        : `/api/number-details/${uploadId}/${selectedNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    }
  });

  // Export table data function
  const exportTableData = async () => {
    setIsExportingTable(true);
    try {
      const response = await fetch('/api/export-top-numbers-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          data,
          valueLabel,
          color,
          totalRecords: data.length
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const fileName = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        a.download = `${fileName}-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export Complete",
          description: `${title} data has been exported successfully`,
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export table data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExportingTable(false);
    }
  };

  return (
    <AnalysisCard
      title={title}
      icon={<IconComponent className="w-5 h-5" />}
      action={
        <Button
          onClick={exportTableData}
          disabled={isExportingTable || data.length === 0}
          size="sm"
          variant="outline"
          className="gap-2"
          data-testid={`button-export-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <Download className="w-4 h-4" />
          {isExportingTable ? 'Exporting...' : 'Export Table'}
        </Button>
      }
    >
      <div className="overflow-hidden">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm" data-testid={`table-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            <thead className="bg-gray-10 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium text-gray-70">Rank</th>
                <th className="text-left p-2 font-medium text-gray-70">Number</th>
                <th className="text-right p-2 font-medium text-gray-70">{valueLabel}</th>
                {showDetailsButton && <th className="text-center p-2 font-medium text-gray-70">Details</th>}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {displayData.map((item) => (
                <tr 
                  key={`${item.rank}-${item.number}`} 
                  className="border-t border-gray-20 hover:bg-gray-10"
                  data-testid={`row-${item.rank}`}
                >
                  <td className="p-2 text-gray-60">{item.rank}</td>
                  <td className="p-2 text-gray-90">{item.number}</td>
                  <td className={`p-2 text-right font-semibold ${colorClasses[color]}`}>
                    {item.displayValue}
                  </td>
                  {showDetailsButton && (
                    <td className="p-2 text-center">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedNumber(item.number)}
                            className="text-xs px-2 py-1"
                            data-testid={`button-details-${item.rank}`}
                          >
                            <Info className="w-3 h-3 mr-1" />
                            Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Phone className="w-5 h-5 mr-2" />
                                Number Details: {selectedNumber}
                              </div>
                              {numberDetails && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const response = await fetch('/api/export-number-html', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          number: numberDetails.number,
                                          totalRecords: numberDetails.totalRecords,
                                          records: numberDetails.records.map(record => ({
                                            ...record,
                                            duration: record.duration || 0 // Ensure raw duration number
                                          }))
                                        })
                                      });
                                      
                                      if (response.ok) {
                                        const blob = await response.blob();
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `number-details-${selectedNumber}-${new Date().toISOString().split('T')[0]}.html`;
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
                                  data-testid="button-export-number-details"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Export HTML
                                </Button>
                              )}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="overflow-y-auto max-h-[60vh]">
                            {detailsLoading ? (
                              <div className="text-center py-8">Loading details...</div>
                            ) : numberDetails ? (
                              <div className="space-y-4">
                                <div className="bg-gray-10 rounded-lg p-4">
                                  <h4 className="font-medium text-gray-90 mb-2">Summary</h4>
                                  <p className="text-sm text-gray-60">
                                    Total Records: <span className="font-semibold">{numberDetails.totalRecords}</span>
                                  </p>
                                </div>
                                
                                <div className="border rounded-lg overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-10">
                                      <tr>
                                        <th className="text-left p-3 font-medium text-gray-70">Date & Time</th>
                                        <th className="text-left p-3 font-medium text-gray-70">Type</th>
                                        <th className="text-center p-3 font-medium text-gray-70">Duration</th>
                                        <th className="text-left p-3 font-medium text-gray-70">Location</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {numberDetails.records.map((record, index) => (
                                        <tr key={record.id} className="border-t border-gray-20 hover:bg-gray-10">
                                          <td className="p-3 text-gray-90">
                                            {(() => {
                                              const date = new Date(record.timestamp);
                                              if (isNaN(date.getTime())) return 'Invalid Date';
                                              return date.toLocaleString('en-US', { 
                                                year: 'numeric', 
                                                month: 'short', 
                                                day: 'numeric',
                                                hour: 'numeric', 
                                                minute: '2-digit',
                                                second: '2-digit',
                                                hour12: true,
                                                timeZone: 'Asia/Karachi'
                                              });
                                            })()}
                                          </td>
                                          <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs ${
                                              record.callType === 'call_outgoing' || record.callType === 'call_incoming' ? 'bg-primary text-white' :
                                              record.callType === 'sms_sent' ? 'bg-warning text-gray-90' :
                                              'bg-accent text-white'
                                            }`}>
                                              {record.callType === 'call_outgoing' ? 'Outgoing Call' :
                                               record.callType === 'call_incoming' ? 'Incoming Call' :
                                               record.callType === 'sms_sent' ? 'SMS Sent' : 'SMS Received'}
                                            </span>
                                          </td>
                                          <td className="p-3 text-center text-gray-90 font-semibold">
                                            {record.callType === 'call_outgoing' || record.callType === 'call_incoming' ? formatCallDuration(record.duration) : '-'}
                                          </td>
                                          <td className="p-3 text-gray-70 text-xs">
                                            {record.location || 'Unknown'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-60">No details available</div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {data.length > 10 && (
          <div className="mt-3 text-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-primary hover:text-blue-700"
                  data-testid={`button-view-all-${title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <ExpandIcon className="w-4 h-4 mr-1" />
                  View All {data.length} Results
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <IconComponent className="w-5 h-5 mr-2" />
                    {title}
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto max-h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-10 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium text-gray-70">Rank</th>
                        <th className="text-left p-2 font-medium text-gray-70">Number</th>
                        <th className="text-right p-2 font-medium text-gray-70">{valueLabel}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {data.map((item) => (
                        <tr 
                          key={`${item.rank}-${item.number}`}
                          className="border-t border-gray-20 hover:bg-gray-10"
                        >
                          <td className="p-2 text-gray-60">{item.rank}</td>
                          <td className="p-2 text-gray-90">{item.number}</td>
                          <td className={`p-2 text-right font-semibold ${colorClasses[color]}`}>
                            {item.displayValue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </AnalysisCard>
  );
}
