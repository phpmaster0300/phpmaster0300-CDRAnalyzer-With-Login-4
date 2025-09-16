import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { type AnalysisData } from "@/lib/types";

interface FileUploadProps {
  onUploadSuccess: (data: { uploadId: string; analysis: AnalysisData }) => void;
}

export function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();

  const uploadFile = useCallback(async (file: File) => {
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 200);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      
      // Log file upload activity
      if (user) {
        try {
          // Get existing activities or initialize empty array
          let existingActivities: any[] = [];
          const activitiesStr = localStorage.getItem('cdr_user_activities');
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
            activityType: 'file_upload',
            timestamp: new Date().toISOString(),
            details: `Uploaded file with ${data.analysis?.fileStats?.totalRecords || 0} records`
          };
          
          // Add new activity to the beginning of the array
          const updatedActivities = [newActivity, ...existingActivities];
          
          // Save to localStorage
          localStorage.setItem('cdr_user_activities', JSON.stringify(updatedActivities));
        } catch (error) {
          console.error('Error logging file upload activity:', error);
        }
      }
      
      setTimeout(() => {
        onUploadSuccess(data);
        toast({
          title: "File processed successfully",
          description: `Analyzed ${data.analysis.fileStats.totalRecords} records in ${data.analysis.fileStats.processingTime}`,
        });
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [onUploadSuccess, toast, user]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <Upload className="h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Upload a file</h3>
      <p className="text-sm text-muted-foreground">
        CSV, XLSX, XLS files are supported
      </p>
      <input
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".csv, .xlsx, .xls"
      />
      <Button
        variant="secondary"
        onClick={() => document.querySelector('input[type="file"]')?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 animate-pulse" />
            Uploading...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </span>
        )}
      </Button>
      {isUploading && <Progress value={uploadProgress} />}
    </div>
  );
}
