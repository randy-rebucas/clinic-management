'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface VitalsEntry {
  visitId: string;
  visitCode: string;
  visitType: string;
  date: string;
  vitals: {
    bp?: string;
    hr?: number;
    rr?: number;
    tempC?: number;
    spo2?: number;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
}

interface ChartDataPoint {
  date: string;
  label: string;
  visitCode: string;
  systolic?: number;
  diastolic?: number;
  hr?: number;
  rr?: number;
  tempC?: number;
  spo2?: number;
  weightKg?: number;
  bmi?: number;
}

interface MetricConfig {
  key: keyof ChartDataPoint;
  label: string;
  color: string;
  unit: string;
  normalMin?: number;
  normalMax?: number;
  yAxisId?: string;
}

const METRICS: MetricConfig[] = [
  { key: 'systolic', label: 'Systolic BP', color: '#ef4444', unit: 'mmHg', normalMin: 90, normalMax: 120, yAxisId: 'bp' },
  { key: 'diastolic', label: 'Diastolic BP', color: '#f97316', unit: 'mmHg', normalMin: 60, normalMax: 80, yAxisId: 'bp' },
  { key: 'hr', label: 'Heart Rate', color: '#8b5cf6', unit: 'bpm', normalMin: 60, normalMax: 100, yAxisId: 'hr' },
  { key: 'spo2', label: 'SpO₂', color: '#06b6d4', unit: '%', normalMin: 95, normalMax: 100, yAxisId: 'spo2' },
  { key: 'tempC', label: 'Temperature', color: '#f59e0b', unit: '°C', normalMin: 36.1, normalMax: 37.2, yAxisId: 'temp' },
  { key: 'weightKg', label: 'Weight', color: '#10b981', unit: 'kg', yAxisId: 'weight' },
  { key: 'bmi', label: 'BMI', color: '#3b82f6', unit: '', normalMin: 18.5, normalMax: 24.9, yAxisId: 'bmi' },
  { key: 'rr', label: 'Resp. Rate', color: '#6366f1', unit: '/min', normalMin: 12, normalMax: 20, yAxisId: 'rr' },
];

function parseBP(bp?: string): { systolic?: number; diastolic?: number } {
  if (!bp) return {};
  const match = bp.match(/^(\d+)\/(\d+)$/);
  if (!match) return {};
  return { systolic: parseInt(match[1], 10), diastolic: parseInt(match[2], 10) };
}

function toChartData(entries: VitalsEntry[]): ChartDataPoint[] {
  return entries.map((e) => {
    const { systolic, diastolic } = parseBP(e.vitals.bp);
    const d = new Date(e.date);
    return {
      date: e.date,
      label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`,
      visitCode: e.visitCode,
      systolic,
      diastolic,
      hr: e.vitals.hr,
      rr: e.vitals.rr,
      tempC: e.vitals.tempC,
      spo2: e.vitals.spo2,
      weightKg: e.vitals.weightKg,
      bmi: e.vitals.bmi,
    };
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry: any) => {
        const metric = METRICS.find((m) => m.key === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600">{entry.name}:</span>
            <span className="font-medium text-gray-800">
              {entry.value}
              {metric?.unit ? ` ${metric.unit}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  patientId?: string;
  /** When true, fetches from /api/patients/me/vitals (patient portal mode) */
  portalMode?: boolean;
  tenantId?: string;
  className?: string;
}

export default function VitalsTrendChart({ patientId, portalMode = false, tenantId, className = '' }: Props) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(['systolic', 'diastolic', 'hr', 'spo2'])
  );
  const [selectedMetricGroup, setSelectedMetricGroup] = useState<'cardio' | 'respiratory' | 'body'>('cardio');

  const metricGroups = {
    cardio: ['systolic', 'diastolic', 'hr'],
    respiratory: ['spo2', 'rr', 'tempC'],
    body: ['weightKg', 'bmi'],
  };

  const fetchVitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (portalMode) {
        url = `/api/patients/me/vitals?limit=30${tenantId ? `&tenantId=${tenantId}` : ''}`;
      } else {
        if (!patientId) return;
        url = `/api/patients/${patientId}/vitals?limit=30`;
      }

      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load vitals');
      setData(toChartData(json.data));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, portalMode, tenantId]);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const switchGroup = (group: 'cardio' | 'respiratory' | 'body') => {
    setSelectedMetricGroup(group);
    setActiveMetrics(new Set(metricGroups[group]));
  };

  const visibleMetrics = METRICS.filter((m) => activeMetrics.has(m.key as string));

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-64 text-red-500 text-sm ${className}`}>
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-64 text-gray-400 ${className}`}>
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">No vitals recorded yet</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="text-base font-semibold text-gray-800">Vitals Trend</h3>

        {/* Metric group tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
          {(['cardio', 'respiratory', 'body'] as const).map((g) => (
            <button
              key={g}
              onClick={() => switchGroup(g)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                selectedMetricGroup === g
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {g === 'cardio' ? 'Cardio' : g === 'respiratory' ? 'Respiratory' : 'Body'}
            </button>
          ))}
        </div>
      </div>

      {/* Individual metric toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {METRICS.filter((m) => metricGroups[selectedMetricGroup].includes(m.key as string)).map((m) => (
          <button
            key={m.key as string}
            onClick={() => toggleMetric(m.key as string)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              activeMetrics.has(m.key as string)
                ? 'border-transparent text-white shadow-sm'
                : 'border-gray-200 text-gray-400 bg-white'
            }`}
            style={activeMetrics.has(m.key as string) ? { backgroundColor: m.color } : {}}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeMetrics.has(m.key as string) ? 'rgba(255,255,255,0.7)' : m.color }}
            />
            {m.label} {m.unit ? `(${m.unit})` : ''}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
            iconType="circle"
            iconSize={8}
          />
          {visibleMetrics.map((m) => (
            <Line
              key={m.key as string}
              type="monotone"
              dataKey={m.key as string}
              name={m.label}
              stroke={m.color}
              strokeWidth={2}
              dot={{ r: 3, fill: m.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-400 mt-2 text-right">
        Showing last {data.length} visit{data.length !== 1 ? 's' : ''} with recorded vitals
      </p>
    </div>
  );
}
