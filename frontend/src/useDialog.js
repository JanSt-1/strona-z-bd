import { useEffect, useRef } from 'react';

// Wspólna obsługa okien (Modal i panel szczegółów zgłoszenia):
// - stos otwartych okien: Escape i Tab obsługuje tylko okno na wierzchu (np. "Cofnij status" otwarte z panelu szczegółów),
// - pułapka fokusu: Tab / Shift+Tab krąży w oknie,
// - po otwarciu fokus trafia na element z atrybutem data-autofocus albo na samo okno (czytnik odczytuje jego tytuł),
// - po zamknięciu fokus wraca na element, który okno otworzył (albo na okno pod spodem, jeśli tego elementu już nie ma).
const dialogStack = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function topDialog() {
  return dialogStack.at(-1) || null;
}

export function useDialog(dialogRef, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const node = dialogRef.current;
    const opener = document.activeElement;
    const entry = { node };
    dialogStack.push(entry);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (node?.querySelector('[data-autofocus]') || node)?.focus();

    function handleKeyDown(e) {
      if (topDialog() !== entry || !node) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1);
      const active = document.activeElement;
      if (!node.contains(active) || active === node) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      dialogStack.splice(dialogStack.indexOf(entry), 1);
      document.body.style.overflow = originalOverflow;
      const target = opener?.isConnected && opener !== document.body ? opener : topDialog()?.node;
      target?.focus?.();
    };
  }, [dialogRef]);
}
