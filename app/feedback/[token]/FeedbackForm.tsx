'use client';

import { useEffect, useState } from 'react';

interface SurveyMeta {
  visitId: string;
  visitDate: string;
  visitType: string;
  providerName: string | null;
  alreadySubmitted: boolean;
}

function StarRating({
  value,
  onChange,
  label,
  required,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-3xl leading-none transition-transform hover:scale-110 focus:outline-none"
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <span className={(hover || value) >= star ? 'text-yellow-400' : 'text-gray-300'}>★</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackForm({ token }: { token: string }) {
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [overallRating, setOverallRating] = useState(0);
  const [doctorRating, setDoctorRating] = useState(0);
  const [staffRating, setStaffRating] = useState(0);
  const [facilityRating, setFacilityRating] = useState(0);
  const [waitTimeRating, setWaitTimeRating] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');

  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error);
        setMeta(j.data);
        if (j.data.alreadySubmitted) setSubmitted(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overallRating) {
      setError('Please provide an overall rating.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overallRating,
          doctorRating: doctorRating || undefined,
          staffRating: staffRating || undefined,
          facilityRating: facilityRating || undefined,
          waitTimeRating: waitTimeRating || undefined,
          comments: comments.trim() || undefined,
          wouldRecommend: wouldRecommend !== null ? wouldRecommend : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Link Not Found</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <p className="text-6xl mb-4">🎉</p>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Thank You!</h1>
          <p className="text-gray-500">Your feedback has been received. We truly appreciate your time and will use it to improve our services.</p>
        </div>
      </div>
    );
  }

  const visitDate = meta?.visitDate
    ? new Date(meta.visitDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">💬</p>
          <h1 className="text-2xl font-bold text-gray-900">How was your visit?</h1>
          {visitDate && (
            <p className="text-sm text-gray-500 mt-1">
              {meta?.visitType && <span className="capitalize">{meta.visitType}</span>} · {visitDate}
              {meta?.providerName && ` · ${meta.providerName}`}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          {/* Overall */}
          <StarRating value={overallRating} onChange={setOverallRating} label="Overall Experience" required />

          {/* Per-category */}
          <div className="grid grid-cols-2 gap-4">
            {meta?.providerName && (
              <StarRating value={doctorRating} onChange={setDoctorRating} label={`Doctor / Provider`} />
            )}
            <StarRating value={staffRating} onChange={setStaffRating} label="Staff & Reception" />
            <StarRating value={facilityRating} onChange={setFacilityRating} label="Facility & Cleanliness" />
            <StarRating value={waitTimeRating} onChange={setWaitTimeRating} label="Wait Time" />
          </div>

          {/* Would recommend */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Would you recommend us to family or friends?</label>
            <div className="flex gap-3">
              {[{ label: 'Yes 👍', value: true }, { label: 'No 👎', value: false }].map(({ label, value }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setWouldRecommend(value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    wouldRecommend === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-1">
            <label htmlFor="comments" className="block text-sm font-medium text-gray-700">
              Additional Comments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Tell us more about your experience…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
            <p className="text-right text-xs text-gray-400">{comments.length}/2000</p>
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !overallRating}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">Your feedback is anonymous and helps us improve.</p>
      </div>
    </div>
  );
}
