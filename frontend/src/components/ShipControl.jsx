import React, { useState } from 'react';

export default function ShipControl({ ticket, onUpdateStatus }) {
  const [numer, setNumer] = useState('');
  const [sending, setSending] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = numer.trim();
  const isEmpty = !trimmed;
  const isTooLong = trimmed.length > 100;
  const showErrorEmpty = touched && isEmpty;
  const showErrorTooLong = trimmed.length > 100;
  const hasError = showErrorEmpty || showErrorTooLong;

  async function handleShip() {
    setTouched(true);
    if (isEmpty || isTooLong) return;
    setSending(true);
    try {
      await onUpdateStatus(ticket.id, 'zakończone', { numer_listu: trimmed });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 w-full max-w-[220px]">
      <input
        type="text"
        placeholder="Nr listu przewozowego *"
        value={numer}
        onChange={(e) => setNumer(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full text-xs px-2 py-1 rounded-md border outline-none transition-colors duration-150 ${
          hasError
            ? 'border-red-500 bg-red-500/10 text-red-950 focus:border-red-600'
            : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600'
        }`}
      />
      <div className="flex justify-between items-center text-[0.7rem]">
        {showErrorEmpty && (
          <span className="text-red-500 font-medium">
            Numer listu jest wymagany.
          </span>
        )}
        {showErrorTooLong && (
          <span className="text-red-500 font-medium">
            Maks. 100 znaków ({trimmed.length}).
          </span>
        )}
        {numer.length > 0 && (
          <span className={`ml-auto font-normal ${isTooLong ? 'text-red-500 font-semibold' : 'text-slate-500'}`}>
            {numer.length}/100
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={sending || isEmpty || isTooLong}
        onClick={handleShip}
        title="Podaj numer listu i oznacz jako wysłane do klienta"
        className={`text-white text-xs font-semibold py-1.5 px-3 rounded-md transition-all duration-200 shadow-sm cursor-pointer ${
          isEmpty || isTooLong || sending
            ? 'bg-purple-400 opacity-60 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 hover:shadow-md'
        }`}
      >
        {sending ? 'Zapisywanie...' : 'Oznacz jako wysłane'}
      </button>
    </div>
  );
}
