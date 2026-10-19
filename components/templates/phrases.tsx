'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ClinicalTemplateDTO } from '@/lib/clinical-templates';

/**
 * Phrase macros for note fields: wrap a form in <PhrasesProvider> and every NoteArea inside
 * expands ".shortcut" + space into the saved phrase. Without a provider nothing expands.
 */

interface PhrasesValue {
  phrases: ReadonlyMap<string, string>;
  markUsed: (shortcut: string) => void;
}

const PhrasesContext = createContext<PhrasesValue | null>(null);

export function PhrasesProvider({
  templates,
  markUsed,
  children,
}: {
  /** Any templates; only phrases are used. */
  templates: ClinicalTemplateDTO[];
  markUsed: (id: string) => void;
  children: ReactNode;
}) {
  const value = useMemo<PhrasesValue>(() => {
    const phrases = new Map<string, string>();
    const ids = new Map<string, string>();
    // Own phrases win over a colleague's shared phrase with the same shortcut.
    const list = templates.filter((t) => t.kind === 'phrase').sort((a, b) => Number(a.mine) - Number(b.mine));
    for (const t of list) {
      if (t.shortcut && t.text !== undefined) {
        phrases.set(t.shortcut, t.text);
        ids.set(t.shortcut, t._id);
      }
    }
    return {
      phrases,
      markUsed: (shortcut) => {
        const id = ids.get(shortcut);
        if (id) markUsed(id);
      },
    };
  }, [templates, markUsed]);
  return <PhrasesContext.Provider value={value}>{children}</PhrasesContext.Provider>;
}

export function usePhrases(): PhrasesValue | null {
  return useContext(PhrasesContext);
}
