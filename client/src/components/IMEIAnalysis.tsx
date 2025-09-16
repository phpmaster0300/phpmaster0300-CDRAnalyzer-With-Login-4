import { AnalysisCard } from "./AnalysisCard";
import { Smartphone, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type IMEIChangeResult } from "@/lib/types";
import { useState } from "react";

interface IMEIAnalysisProps {
  data: IMEIChangeResult[];
}

function getBorderColor(changeNumber: number): string {
  if (changeNumber <= 2) return 'border-warning';
  if (changeNumber <= 5) return 'border-danger';
  return 'border-red-600';
}

export function IMEIAnalysis({ data }: IMEIAnalysisProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  
  const totalChanges = data.reduce((sum, item) => sum + item.totalChanges, 0);
  const affectedNumbers = data.length;
  const uniqueIMEIs = data.reduce((set, item) => {
    item.changes.forEach(change => {
      set.add(change.oldIMEI);
      set.add(change.newIMEI);
    });
    return set;
  }, new Set()).size;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      const response = await fetch('/api/export-imei-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data,
          totalChanges,
          affectedNumbers,
          uniqueIMEIs
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `imei-analysis-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export Complete",
          description: "IMEI analysis has been exported successfully",
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export IMEI analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AnalysisCard
      title="IMEI Change Detection & Analysis"
      icon={<Smartphone className="w-5 h-5" />}
    >
      <div className="space-y-6">
        {/* IMEI Change Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-danger" data-testid="text-changes-detected">
              {totalChanges}
            </p>
            <p className="text-sm text-gray-60">IMEI Changes Detected</p>
          </div>
          <div className="bg-gray-10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warning" data-testid="text-affected-numbers">
              {affectedNumbers}
            </p>
            <p className="text-sm text-gray-60">Numbers Affected</p>
          </div>
          <div className="bg-gray-10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary" data-testid="text-unique-imeis">
              {uniqueIMEIs}
            </p>
            <p className="text-sm text-gray-60">Unique IMEIs Found</p>
          </div>
        </div>

        {/* Export Button */}
        {data.length > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="button-export-imei"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export IMEI Analysis'}
            </Button>
          </div>
        )}

        {/* IMEI Change Details */}
        {data.length > 0 && (
          <div className="border border-gray-20 rounded-lg overflow-hidden">
            <div className="bg-gray-10 px-4 py-3">
              <h4 className="font-medium text-gray-90">IMEI Change Timeline</h4>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <div className="p-4 space-y-4">
                {data.slice(0, 10).map((imeiChange, index) => (
                  <div key={`${imeiChange.number}-${index}`} className="space-y-4">
                    {imeiChange.changes.map((change, changeIndex) => (
                      <div 
                        key={`${imeiChange.number}-${changeIndex}`}
                        className={`border-l-4 ${getBorderColor(changeIndex + 1)} pl-4 pb-4`}
                        data-testid={`imei-change-${index}-${changeIndex}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-gray-90 font-mono">{imeiChange.number}</p>
                            <p className="text-sm text-gray-60">
                              {new Date(change.timestamp).toLocaleString('en-US', { hour12: true })}
                            </p>
                          </div>
                          <span className="bg-danger text-white px-2 py-1 rounded text-xs">
                            Change #{changeIndex + 1}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-60">Previous IMEI:</p>
                            <p className="font-mono text-gray-90 bg-gray-10 px-2 py-1 rounded">
                              {change.oldIMEI}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-60">New IMEI:</p>
                            <p className="font-mono text-gray-90 bg-accent/10 px-2 py-1 rounded">
                              {change.newIMEI}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-3 bg-gray-10 rounded-lg p-3">
                          <h5 className="font-medium text-gray-90 mb-2">Activity After IMEI Change:</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-gray-60">Calls Made:</p>
                              <p className="font-semibold text-primary">{change.callsAfter} calls</p>
                            </div>
                            <div>
                              <p className="text-gray-60">Total Duration:</p>
                              <p className="font-semibold text-accent">
                                {Math.floor(change.durationAfter / 3600)}h {Math.floor((change.durationAfter % 3600) / 60)}m
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-60">SMS Sent:</p>
                              <p className="font-semibold text-warning">{change.smsAfter.sent} msgs</p>
                            </div>
                            <div>
                              <p className="text-gray-60">SMS Received:</p>
                              <p className="font-semibold text-danger">{change.smsAfter.received} msgs</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                
                {data.length > 10 && (
                  <div className="text-center pt-4 border-t border-gray-20">
                    <p className="text-sm text-gray-60">
                      Showing 10 of {data.length} numbers with IMEI changes
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {data.length === 0 && (
          <div className="text-center py-8">
            <Smartphone className="w-12 h-12 text-gray-40 mx-auto mb-4" />
            <p className="text-gray-60">No IMEI changes detected in the uploaded data</p>
          </div>
        )}
      </div>
    </AnalysisCard>
  );
}
