'use client';

import { useState, useEffect, useCallback } from 'react';

interface Membership {
  _id: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | string;
  membershipNumber: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  points: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  discountPercentage: number;
  benefits: string[];
  joinDate: string;
  expiryDate?: string;
  renewalDate?: string;
  transactions?: Array<{
    type: 'earn' | 'redeem' | 'expire' | 'adjustment';
    points: number;
    description: string;
    createdAt: string;
  }>;
  createdAt: string;
}

interface MembershipsPageClientProps {
  user: { role: string; [key: string]: any };
}

const TIERS = [
  { value: 'bronze', label: 'Bronze', color: 'bg-amber-100 text-amber-800', discount: 5 },
  { value: 'silver', label: 'Silver', color: 'bg-gray-200 text-gray-800', discount: 10 },
  { value: 'gold', label: 'Gold', color: 'bg-yellow-100 text-yellow-800', discount: 15 },
  { value: 'platinum', label: 'Platinum', color: 'bg-purple-100 text-purple-800', discount: 20 },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  { value: 'expired', label: 'Expired', color: 'bg-red-100 text-red-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-orange-100 text-orange-800' },
];

export default function MembershipsPageClient({ user }: MembershipsPageClientProps) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<Membership | null>(null);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsForm, setPointsForm] = useState({ type: 'earn', points: 0, description: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMemberships = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (tierFilter) params.set('tier', tierFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/memberships?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMemberships(Array.isArray(data) ? data : data.memberships || []);
      }
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  }, [tierFilter, statusFilter, search]);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  const handleViewDetails = async (membership: Membership) => {
    try {
      const response = await fetch(`/api/memberships/${membership._id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedMembership(data);
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error fetching membership details:', error);
    }
  };

  const handleAddPoints = async () => {
    if (!selectedMembership) return;

    try {
      const response = await fetch(`/api/memberships/${selectedMembership._id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pointsForm),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Points updated successfully' });
        setShowPointsModal(false);
        setPointsForm({ type: 'earn', points: 0, description: '' });
        fetchMemberships();
        handleViewDetails(selectedMembership);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to update points' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const handleUpgradeTier = async (membership: Membership, newTier: string) => {
    try {
      const response = await fetch(`/api/memberships/${membership._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: newTier }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Membership tier updated successfully' });
        fetchMemberships();
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to update tier' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const getTierBadge = (tier: string) => {
    const t = TIERS.find(ti => ti.value === tier);
    return t ? (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${t.color}`}>
        {t.label}
      </span>
    ) : tier;
  };

  const getStatusBadge = (status: string) => {
    const s = STATUS_OPTIONS.find(st => st.value === status);
    return s ? (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${s.color}`}>
        {s.label}
      </span>
    ) : status;
  };

  const getPatientName = (patient: Membership['patient']) => {
    if (typeof patient === 'string') return 'Unknown';
    return `${patient.firstName} ${patient.lastName}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Stats
  const stats = {
    total: memberships.length,
    active: memberships.filter(m => m.status === 'active').length,
    totalPoints: memberships.reduce((sum, m) => sum + m.points, 0),
    byTier: TIERS.reduce((acc, tier) => {
      acc[tier.value] = memberships.filter(m => m.tier === tier.value).length;
      return acc;
    }, {} as Record<string, number>),
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-700">Loading memberships...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {message && (
            <div className={`rounded-md p-3 ${message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{message.text}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Memberships</h1>
              <p className="text-sm text-gray-500">Manage patient loyalty program memberships</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Total</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Active</div>
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Bronze</div>
                <div className="text-2xl font-bold text-amber-600">{stats.byTier.bronze || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Silver</div>
                <div className="text-2xl font-bold text-gray-600">{stats.byTier.silver || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Gold</div>
                <div className="text-2xl font-bold text-yellow-600">{stats.byTier.gold || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[100px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Platinum</div>
                <div className="text-2xl font-bold text-purple-600">{stats.byTier.platinum || 0}</div>
              </div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by member name..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div style={{ minWidth: '140px' }}>
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Tiers</option>
                    {TIERS.map(tier => (
                      <option key={tier.value} value={tier.value}>{tier.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: '140px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Status</option>
                    {STATUS_OPTIONS.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Memberships Table */}
          {memberships.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-8 text-center">
                <div className="mb-3">
                  <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-1">No memberships found</h2>
                <p className="text-sm text-gray-500">No membership records match your filters.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Membership #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {memberships.map((membership) => (
                    <tr key={membership._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {getPatientName(membership.patient)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Since {formatDate(membership.joinDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                        {membership.membershipNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getTierBadge(membership.tier)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{membership.points.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          Earned: {membership.totalPointsEarned.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {membership.discountPercentage}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(membership.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(membership.expiryDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleViewDetails(membership)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          View
                        </button>
                        <select
                          onChange={(e) => {
                            if (e.target.value) handleUpgradeTier(membership, e.target.value);
                            e.target.value = '';
                          }}
                          className="text-sm border-gray-300 rounded"
                          defaultValue=""
                        >
                          <option value="">Upgrade</option>
                          {TIERS.filter(t => t.value !== membership.tier).map(tier => (
                            <option key={tier.value} value={tier.value}>{tier.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Membership Details Modal */}
          {showModal && selectedMembership && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Membership Details</h2>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Member Information</h3>
                      <div className="space-y-2">
                        <div><span className="text-gray-500">Name:</span> {getPatientName(selectedMembership.patient)}</div>
                        <div><span className="text-gray-500">Membership #:</span> {selectedMembership.membershipNumber}</div>
                        <div><span className="text-gray-500">Tier:</span> {getTierBadge(selectedMembership.tier)}</div>
                        <div><span className="text-gray-500">Status:</span> {getStatusBadge(selectedMembership.status)}</div>
                        <div><span className="text-gray-500">Join Date:</span> {formatDate(selectedMembership.joinDate)}</div>
                        <div><span className="text-gray-500">Expiry Date:</span> {formatDate(selectedMembership.expiryDate)}</div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-4">Points Summary</h3>
                      <div className="space-y-2">
                        <div className="text-3xl font-bold text-blue-600">{selectedMembership.points.toLocaleString()} pts</div>
                        <div><span className="text-gray-500">Total Earned:</span> {selectedMembership.totalPointsEarned.toLocaleString()}</div>
                        <div><span className="text-gray-500">Total Redeemed:</span> {selectedMembership.totalPointsRedeemed.toLocaleString()}</div>
                        <div><span className="text-gray-500">Discount:</span> <span className="text-green-600 font-medium">{selectedMembership.discountPercentage}%</span></div>
                      </div>
                      <button
                        onClick={() => setShowPointsModal(true)}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Adjust Points
                      </button>
                    </div>
                  </div>

                  {selectedMembership.benefits && selectedMembership.benefits.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">Benefits</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedMembership.benefits.map((benefit, i) => (
                          <span key={i} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                            {benefit.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedMembership.transactions && selectedMembership.transactions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-2">Recent Transactions</h3>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {selectedMembership.transactions.slice(0, 10).map((tx, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 text-sm text-gray-500">{formatDate(tx.createdAt)}</td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 text-xs rounded ${
                                    tx.type === 'earn' ? 'bg-green-100 text-green-800' :
                                    tx.type === 'redeem' ? 'bg-blue-100 text-blue-800' :
                                    tx.type === 'expire' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {tx.type}
                                  </span>
                                </td>
                                <td className={`px-4 py-2 text-sm font-medium ${
                                  tx.type === 'earn' ? 'text-green-600' : 
                                  tx.type === 'redeem' || tx.type === 'expire' ? 'text-red-600' : ''
                                }`}>
                                  {tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.points)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-600">{tx.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Points Adjustment Modal */}
          {showPointsModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold">Adjust Points</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
                    <select
                      value={pointsForm.type}
                      onChange={(e) => setPointsForm({ ...pointsForm, type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="earn">Earn (Add Points)</option>
                      <option value="redeem">Redeem (Use Points)</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
                    <input
                      type="number"
                      value={pointsForm.points}
                      onChange={(e) => setPointsForm({ ...pointsForm, points: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={pointsForm.description}
                      onChange={(e) => setPointsForm({ ...pointsForm, description: e.target.value })}
                      placeholder="e.g., Visit reward, Manual adjustment"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-4">
                  <button
                    onClick={() => setShowPointsModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPoints}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

