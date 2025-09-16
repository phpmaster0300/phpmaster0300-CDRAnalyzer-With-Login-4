interface AnalysisCardProps {
  title: string;
  icon?: React.ReactNode;
  status?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AnalysisCard({ title, icon, status, action, children, className = "" }: AnalysisCardProps) {
  return (
    <div className={`bg-surface rounded-lg p-6 border border-gray-20 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-90 flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {action}
          {status && (
            <span className="bg-accent text-white px-3 py-1 rounded-full text-sm">
              {status}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
