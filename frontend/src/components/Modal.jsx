import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../useDialog';

export default function Modal({ title, icon, maxWidth = 'max-w-md', error, onClose, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useDialog(dialogRef, onClose);

  return createPortal(
    // Kliknięcie w tło to wygoda dla myszy; z klawiatury okno zamyka Escape albo przycisk "Zamknij"
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* <dialog open> bez showModal(): tło, stos okien i pułapkę fokusu obsługuje useDialog */}
      <dialog
        open
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-card outline-none ${maxWidth}`}
      >
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-line">
          <h3 id={titleId} className="text-lg font-bold text-ink flex items-center gap-2">
            {icon && <span aria-hidden="true">{icon}</span>}
            <span>{title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            title="Zamknij (Esc)"
            className="text-danger hover:text-danger text-xl font-bold p-1 leading-none transition-colors cursor-pointer rounded-md"
          >
            ✕
          </button>
        </div>

        {error && (
          <div role="alert" className="bg-danger/10 border border-danger/40 text-danger p-3 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        {children}
      </dialog>
    </div>,
    document.body
  );
}
