'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClinicalTemplateDTO, TemplateKind } from '@/lib/clinical-templates';

type CreateInput = Omit<ClinicalTemplateDTO, '_id' | 'mine' | 'usageCount' | 'shared' | 'starter' | 'ownerName'> & { shared?: boolean };

export interface TemplatesState {
  templates: ClinicalTemplateDTO[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Resolves to the saved template, or throws with the server's message. */
  create: (input: CreateInput) => Promise<ClinicalTemplateDTO>;
  update: (id: string, patch: Partial<CreateInput>) => Promise<ClinicalTemplateDTO>;
  remove: (id: string) => Promise<void>;
  /** Fire-and-forget usage count so favourites sort first. */
  markUsed: (id: string) => void;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const issue = json?.issues?.[0]?.message;
    throw new Error(issue || json?.error || 'Something went wrong. Try again.');
  }
  return json.data;
}

export function useTemplates(kind?: TemplateKind): TemplatesState {
  const [templates, setTemplates] = useState<ClinicalTemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/clinical-templates${kind ? `?kind=${kind}` : ''}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json?.success) {
          setTemplates(json.data);
          setError(null);
        } else setError(json?.error || 'Templates could not be loaded.');
      })
      .catch(() => alive && setError('Templates could not be loaded.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [kind, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const create = useCallback(async (input: CreateInput) => {
    const saved: ClinicalTemplateDTO = await send('/api/clinical-templates', 'POST', input);
    setTemplates((list) => [saved, ...list]);
    return saved;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<CreateInput>) => {
    const saved: ClinicalTemplateDTO = await send(`/api/clinical-templates/${id}`, 'PUT', patch);
    setTemplates((list) => list.map((t) => (t._id === id ? saved : t)));
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await send(`/api/clinical-templates/${id}`, 'DELETE');
    setTemplates((list) => list.filter((t) => t._id !== id));
  }, []);

  const markUsed = useCallback((id: string) => {
    if (id.startsWith('starter:')) return;
    setTemplates((list) => list.map((t) => (t._id === id ? { ...t, usageCount: t.usageCount + 1 } : t)));
    fetch(`/api/clinical-templates/${id}/use`, { method: 'POST' }).catch(() => {});
  }, []);

  return { templates, loading, error, reload, create, update, remove, markUsed };
}
