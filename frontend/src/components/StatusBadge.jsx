import React from 'react';
import { STATUS_LABELS } from '../constants';

export default function StatusBadge({ status }) {
  const normalized = status ? status.toLowerCase() : 'nowe';
  const label = STATUS_LABELS[normalized] || status;

  const styleMap = {
    nowe: 'bg-[#333131]/90 text-[#00ff15] border-[#00ff15]',
    w_realizacji: 'bg-[#333131]/90 text-amber-400 border-amber-400/40',
    do_wysylki: 'bg-[#333131]/90 text-purple-300 border-purple-400/50',
    'zakończone': 'bg-[#333131]/90 text-blue-300 border-blue-400/40',
    zakonczone: 'bg-[#333131]/90 text-blue-300 border-blue-400/40'
  };

  const badgeClass = styleMap[normalized] || 'bg-gray-800 text-gray-200 border-gray-600';

  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm ${badgeClass}`}>
      {label}
    </span>
  );
}
