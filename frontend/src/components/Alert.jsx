import React from 'react';

export default function Alert({ alert }) {
  if (!alert || !alert.message) return null;

  const isSuccess = alert.type === 'success';
  const isError = alert.type === 'error';

  return (
    <div
      role="alert"
      className={`p-3.5 mb-5 rounded-lg text-sm font-medium border flex items-center justify-between transition-all duration-200 animate-[fadeIn_0.2s_ease-out] ${
        isSuccess
          ? 'bg-emerald-950/20 border-emerald-500/80 text-emerald-950 shadow-sm'
          : isError
          ? 'bg-red-500/15 border-red-500/40 text-red-700 shadow-sm'
          : 'bg-blue-500/15 border-blue-500/30 text-blue-800'
      }`}
    >
      <div className="flex items-center gap-2">
        {isSuccess && (
          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isError && (
          <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <span>{alert.message}</span>
      </div>
    </div>
  );
}
