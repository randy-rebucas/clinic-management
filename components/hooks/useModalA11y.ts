'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

// Stack of open dialogs so only the topmost one reacts to Escape/Tab.
const openStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = '';

let idCounter = 0;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

interface ModalA11yOptions {
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  /** Lock body scroll while open (default true). */
  lockScroll?: boolean;
}

/**
 * Accessibility behaviour for a modal dialog container: role/aria-modal, an accessible name taken
 * from the first heading when none is given, initial focus, a Tab focus trap, Escape to close,
 * body scroll lock, and focus restoration to the trigger on close.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: (() => void) | undefined,
  { closeOnEscape = true, lockScroll = true }: ModalA11yOptions = {}
) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;

    const token = Symbol('modal');
    openStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (!container.getAttribute('role')) container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    if (!container.hasAttribute('aria-labelledby') && !container.hasAttribute('aria-label')) {
      const heading = container.querySelector<HTMLElement>('h1, h2, h3, h4, [data-dialog-title]');
      if (heading) {
        if (!heading.id) heading.id = `dialog-title-${++idCounter}`;
        container.setAttribute('aria-labelledby', heading.id);
      }
    }
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');

    if (lockScroll) {
      if (scrollLocks === 0) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      scrollLocks++;
    }

    if (!container.contains(document.activeElement)) {
      const preferred = container.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      const target =
        preferred ??
        getFocusable(container).find((el) => !el.hasAttribute('data-dialog-close')) ??
        container;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === 'Escape' && closeOnEscape && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const idx = openStack.indexOf(token);
      if (idx !== -1) openStack.splice(idx, 1);
      if (lockScroll) {
        scrollLocks = Math.max(0, scrollLocks - 1);
        if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
      }
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, closeOnEscape, lockScroll]);

  return ref;
}
