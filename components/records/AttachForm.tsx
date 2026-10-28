'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { FIELD, FOCUS_RING, Svg } from '../appointments/shared';
import { fileSize } from './labels';

/** What the upload routes accept (lib/upload-validation ALLOWED_UPLOAD_TYPES, 5 MB inline cap). */
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain';
export const UPLOAD_MAX = 5 * 1024 * 1024;

const CLIP = 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13';

/** Attach one file with a note of what it shows; checks type and size before uploading. */
export default function AttachForm({
  onUpload,
  placeholder = 'Chest X-ray, PA view',
  noun = 'visit',
  children,
}: {
  onUpload: (file: File, notes: string) => Promise<boolean>;
  placeholder?: string;
  /** What the file is attached to, for the size message. */
  noun?: string;
  /** Extra options shown above the file picker. */
  children?: ReactNode;
}) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = (f: File | null) => {
    setProblem(null);
    if (f && !UPLOAD_ACCEPT.split(',').includes(f.type)) {
      setProblem(`${f.name} can’t be attached. Use a JPEG, PNG, GIF or WebP image, a PDF, or a text file.`);
      setFile(null);
      return;
    }
    if (f && f.size > UPLOAD_MAX) {
      setProblem(`${f.name} is ${fileSize(f.size)}. Files attached to a ${noun} can be up to 5 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  return (
    <form
      className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setUploading(true);
        const ok = await onUpload(file, notes.trim());
        setUploading(false);
        if (!ok) return;
        setFile(null);
        setNotes('');
        if (input.current) input.current.value = '';
      }}
    >
      {children}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`${ids}-file`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Attach a file
          </label>
          <input
            ref={input}
            id={`${ids}-file`}
            type="file"
            accept={UPLOAD_ACCEPT}
            aria-describedby={`${ids}-hint`}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className={`${FIELD} py-1.5 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-2.5 file:py-1 file:text-sm file:font-semibold file:text-gray-900 hover:file:bg-gray-200`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-sm font-medium text-gray-700">
            What it shows <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input id={`${ids}-notes`} type="text" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder={placeholder} className={FIELD} />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          <Svg d={CLIP} />
          {uploading ? 'Attaching…' : 'Attach'}
        </button>
      </div>
      <p id={`${ids}-hint`} className={`text-sm ${problem ? 'font-medium text-red-700' : 'text-gray-500'}`} role={problem ? 'alert' : undefined}>
        {problem ?? 'JPEG, PNG, GIF or WebP images, PDFs and text files, up to 5 MB each.'}
      </p>
    </form>
  );
}
