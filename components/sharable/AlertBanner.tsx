interface AlertBannerProps {
  type: 'error' | 'success' | 'warning' | 'info';
  message: string;
  title?: string;
  className?: string;
}

const variants = {
  error: {
    wrapper: 'bg-red-50 border-red-500',
    icon: 'text-red-600',
    title: 'text-red-800',
    text: 'text-red-800',
    path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  success: {
    wrapper: 'bg-green-50 border-green-500',
    icon: 'text-green-600',
    title: 'text-green-800',
    text: 'text-green-800',
    path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    wrapper: 'bg-yellow-50 border-yellow-500',
    icon: 'text-yellow-600',
    title: 'text-yellow-800',
    text: 'text-yellow-800',
    path: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  },
  info: {
    wrapper: 'bg-blue-50 border-blue-500',
    icon: 'text-blue-600',
    title: 'text-blue-800',
    text: 'text-blue-800',
    path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

export default function AlertBanner({ type, message, title, className = '' }: AlertBannerProps) {
  const v = variants[type];
  return (
    <div className={`${v.wrapper} border-l-4 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2 ${className}`}>
      <div className="flex items-start gap-3">
        <svg className={`w-5 h-5 ${v.icon} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={v.path} />
        </svg>
        <div className="flex-1">
          {title && <p className={`text-sm font-semibold ${v.title} mb-0.5`}>{title}</p>}
          <p className={`text-sm font-medium ${v.text}`}>{message}</p>
        </div>
      </div>
    </div>
  );
}
