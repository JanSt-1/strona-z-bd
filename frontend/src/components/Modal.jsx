import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, icon, maxWidth = 'max-w-md', error, onClose, children }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-card ${maxWidth}`}>
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-line">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            {icon && <span>{icon}</span>}
            <span>{title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-danger hover:text-danger text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/40 text-danger p-3 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        {children}
      </div>
    </div>,
    document.body
  );
}
