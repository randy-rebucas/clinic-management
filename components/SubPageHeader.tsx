import Link from 'next/link';

interface SubPageHeaderProps {
  backHref: string;
  iconPath: string;
  iconGradient?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export default function SubPageHeader({
  backHref,
  iconPath,
  iconGradient = 'from-blue-500 to-blue-600',
  title,
  subtitle,
  actions,
}: SubPageHeaderProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
      <div className="flex items-start gap-4">

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Icon badge */}
            <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-md flex-shrink-0`}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
              </svg>
            </div>

            {/* Title & subtitle */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">{title}</h1>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>

            {/* Actions */}
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
