'use client';

import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface PatientNote {
  _id: string;
  content: string;
  author: {
    name: string;
    role: string;
  };
  visibility: 'private' | 'internal' | 'shared';
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface PatientNotesComponentProps {
  patientId: string;
}

export default function PatientNotesComponent({ patientId }: PatientNotesComponentProps) {
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState<'private' | 'internal' | 'shared'>('internal');
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [newTags, setNewTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/notes?limit=50`);
      const data = await res.json();
      if (data.success) {
        setNotes(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch notes');
      }
    } catch (err) {
      setError('Failed to fetch notes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  const handleAddNote = async () => {
    if (!newContent.trim()) {
      setError('Note content is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const tags = newTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const res = await fetch(`/api/patients/${patientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          visibility: newVisibility,
          priority: newPriority,
          tags,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotes([data.data, ...notes]);
        setNewContent('');
        setNewVisibility('internal');
        setNewPriority('normal');
        setNewTags('');
        setShowForm(false);
      } else {
        setError(data.error || 'Failed to create note');
      }
    } catch (err) {
      setError('Failed to create note');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;

    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/notes/${noteId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setNotes(notes.filter((n) => n._id !== noteId));
      } else {
        setError(data.error || 'Failed to delete note');
      }
    } catch (err) {
      setError('Failed to delete note');
      console.error(err);
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'private':
        return '🔒';
      case 'shared':
        return '👁️';
      default:
        return '👥';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Internal Notes</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) setError(null);
          }}
          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-semibold text-sm inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Note
        </button>
      </div>

      {/* Add Note Form */}
      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a note..."
            rows={4}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          />

          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Visibility</label>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as any)}
                className="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="internal">Internal Only</option>
                <option value="private">Private (Me Only)</option>
                <option value="shared">Shared with Patient</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g., follow-up, insurance"
                className="w-full px-2 py-2 border border-gray-300 rounded text-sm focus-ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
                setNewContent('');
                setError(null);
              }}
              className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNote}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Notes List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-lg h-20 animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No notes yet. Click "Add Note" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note._id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500">{note.author.name}</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span title={new Date(note.createdAt).toLocaleString()} className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                  </span>
                  {note.priority && note.priority !== 'normal' && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(note.priority)}`}>
                      {note.priority.toUpperCase()}
                    </span>
                  )}
                  <span className="text-lg">{getVisibilityIcon(note.visibility)}</span>
                </div>
                <button
                  onClick={() => handleDeleteNote(note._id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete note"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">{note.content}</p>

              {note.tags && note.tags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {note.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
