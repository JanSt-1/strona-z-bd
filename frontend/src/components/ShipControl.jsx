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
            ? 'border-danger bg-danger/10 text-danger focus:border-danger/40'
            : 'border-line bg-card text-ink focus:border-primary/30'
        }`}
      />
      <div className="flex justify-between items-center text-[0.7rem]">
        {showErrorEmpty && (
          <span className="text-danger font-medium">
            Numer listu jest wymagany.
          </span>
        )}
        {showErrorTooLong && (
          <span className="text-danger font-medium">
            Maks. 100 znaków ({trimmed.length}).
          </span>
        )}
        {numer.length > 0 && (
          <span className={`ml-auto font-normal ${isTooLong ? 'text-danger font-semibold' : 'text-muted'}`}>
            {numer.length}/100
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={sending || isEmpty || isTooLong}
        onClick={handleShip}
        title="Podaj numer listu i oznacz jako wysłane do klienta"
        className="btn-primary py-1.5 px-3 text-xs w-full"
      >
        {sending ? 'Zapisywanie...' : 'Oznacz jako wysłane'}
      </button>
    </div>
  );
}
