import React from 'react';
import { STATUS_LABELS } from '../constants';

export default function StatusBadge({ status }) {
  const normalized = status ? status.toLowerCase() : 'nowe';
  const label = STATUS_LABELS[normalized] || status;

  const styleMap = {
    nowe: 'status-nowe',
    w_realizacji: 'status-w_realizacji',
    do_wysylki: 'status-do_wysylki',
    'zakończone': 'status-zakonczone',
    zakonczone: 'status-zakonczone'
  };

  const badgeClass = styleMap[normalized] || 'status-nowe';

  return (
    <span className={`status-badge ${badgeClass}`}>
      {label}
    </span>
  );
}

