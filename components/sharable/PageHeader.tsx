interface PageHeaderProps {
  iconPath: string;
  iconGradient?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export default function PageHeader({
  iconPath,
  iconGradient = 'from-blue-500 to-blue-600',
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 bg-gradient-to-br ${iconGradient} rounded-lg shadow-md`}>
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
