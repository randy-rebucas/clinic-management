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
  const [currentUserMembership, setCurrentUserMembership] = useState<Membership | null>(null);
  const [loadingUserMembership, setLoadingUserMembership] = useState(true);

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
        setMemberships(data.success ? (Array.isArray(data.data) ? data.data : []) : []);
      }
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  }, [tierFilter, statusFilter, search]);

  const fetchCurrentUserMembership = useCallback(async () => {
    try {
      setLoadingUserMembership(true);
      // First, get the current user's email
      const userRes = await fetch('/api/user/me');
      if (!userRes.ok) {
        setLoadingUserMembership(false);
        return;
      }
      
      const userData = await userRes.json();
      if (!userData.success || !userData.user?.email) {
        setLoadingUserMembership(false);
        return;
      }

      // Find patient by email using search parameter
      const patientRes = await fetch(`/api/patients?search=${encodeURIComponent(userData.user.email)}`);
      if (!patientRes.ok) {
        setLoadingUserMembership(false);
        return;
      }

      const patientData = await patientRes.json();
      if (!patientData.success || !patientData.data || patientData.data.length === 0) {
        setLoadingUserMembership(false);
        return;
      }

      const patient = Array.isArray(patientData.data) ? patientData.data[0] : patientData.data;
      const patientId = patient._id || patient.id;

      // Fetch membership for this patient
      const membershipRes = await fetch(`/api/memberships?patientId=${patientId}&status=active`);
      if (membershipRes.ok) {
        const membershipData = await membershipRes.json();
        if (membershipData.success && membershipData.data) {
          const memberships = Array.isArray(membershipData.data) ? membershipData.data : [membershipData.data];
          if (memberships.length > 0) {
            // Ensure we have the full membership object with all fields
            const membership = memberships[0];
            setCurrentUserMembership(membership);
          } else {
            setCurrentUserMembership(null);
          }
        } else {
          setCurrentUserMembership(null);
        }
      } else {
        setCurrentUserMembership(null);
      }
    } catch (error) {
      console.error('Error fetching current user membership:', error);
    } finally {
      setLoadingUserMembership(false);
    }
  }, []);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  useEffect(() => {
    fetchCurrentUserMembership();
  }, []);

  const handleViewDetails = async (membership: Membership) => {
    try {
      const response = await fetch(`/api/memberships/${membership._id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedMembership(data.success ? data.data : data);
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
        const data = await response.json();
        // Update the current user membership if it's the one being updated
        if (currentUserMembership && selectedMembership && currentUserMembership._id === selectedMembership._id) {
          // Fetch updated membership details
          const updatedRes = await fetch(`/api/memberships/${selectedMembership._id}`);
          if (updatedRes.ok) {
            const updatedData = await updatedRes.json();
            if (updatedData.success && updatedData.data) {
              setCurrentUserMembership(updatedData.data);
            }
          }
        }
        setMessage({ type: 'success', text: 'Points updated successfully' });
        setTimeout(() => setMessage(null), 5000);
        setShowPointsModal(false);
        setPointsForm({ type: 'earn', points: 0, description: '' });
        fetchMemberships();
        fetchCurrentUserMembership(); // Refresh current user's membership
        handleViewDetails(selectedMembership);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to update points' });
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleUpgradeTier = async (membership: Membership, newTier: string) => {
    try {
      const response = await fetch(`/api/memberships/${membership._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: newTier }),
      });

      const data = await response.json();
      
      if (response.ok && data.success && data.data) {
        // Immediately update the current user membership if it's the one being upgraded
        if (currentUserMembership && currentUserMembership._id === membership._id) {
          setCurrentUserMembership(data.data);
        }
        setMessage({ type: 'success', text: 'Membership tier updated successfully' });
        setTimeout(() => setMessage(null), 5000);
        // Refresh the memberships list
        fetchMemberships();
        // Also refresh current user membership to ensure we have the latest data
        await fetchCurrentUserMembership();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update tier' });
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (error) {
      console.error('Error upgrading tier:', error);
      setMessage({ type: 'error', text: 'An error occurred while upgrading tier' });
      setTimeout(() => setMessage(null), 5000);
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-100 border-t-emerald-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading memberships...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {message && (
            <div className={`rounded-xl p-4 shadow-sm ${message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-3">
                {message.type === 'success' ? (
                  <div className="p-2 bg-green-500 rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <p className={`text-sm font-semibold ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{message.text}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Memberships</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">Manage patient loyalty program memberships</p>
              </div>
            </div>
          </div>

          {/* Current User's Active Membership */}
          {!loadingUserMembership && currentUserMembership && (
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-200 rounded-xl shadow-lg p-6 sm:p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-md">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Your Active Membership</h2>
                    <p className="text-sm text-gray-600 mt-1">Membership #{currentUserMembership.membershipNumber}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMembership(currentUserMembership);
                    setShowModal(true);
                  }}
                  className="px-4 py-2 text-sm font-semibold bg-white text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200"
                >
                  View Details
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg p-4 border border-emerald-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Tier</div>
                  <div className="text-lg font-bold text-gray-900">{getTierBadge(currentUserMembership.tier)}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-emerald-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Current Points</div>
                  <div className="text-2xl font-bold text-emerald-600">{currentUserMembership.points.toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-emerald-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Discount</div>
                  <div className="text-2xl font-bold text-green-600">{currentUserMembership.discountPercentage}%</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-emerald-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</div>
                  <div className="text-lg font-bold">{getStatusBadge(currentUserMembership.status)}</div>
                </div>
              </div>

              {/* Upgrade Section */}
              {currentUserMembership.tier !== 'platinum' && (
                <div className="bg-white rounded-lg p-6 border border-emerald-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Upgrade Your Membership</h3>
                      <p className="text-sm text-gray-600">Unlock more benefits and higher discounts</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {TIERS.filter(tier => {
                      const currentTierIndex = TIERS.findIndex(t => t.value === currentUserMembership.tier);
                      const tierIndex = TIERS.findIndex(t => t.value === tier.value);
                      return tierIndex > currentTierIndex;
                    }).map(tier => (
                      <div key={tier.value} className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`px-3 py-1 text-sm font-semibold rounded-full ${tier.color}`}>
                            {tier.label}
                          </span>
                          <span className="text-sm font-bold text-gray-700">{tier.discount}% OFF</span>
                        </div>
                        <div className="space-y-2 mb-4">
                          <div className="text-xs text-gray-600">• Higher discount rate</div>
                          <div className="text-xs text-gray-600">• Priority booking</div>
                          <div className="text-xs text-gray-600">• Exclusive benefits</div>
                        </div>
                        <button
                          onClick={() => handleUpgradeTier(currentUserMembership, tier.value)}
                          className="w-full px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all font-semibold text-sm shadow-md"
                        >
                          Upgrade to {tier.label}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentUserMembership.tier === 'platinum' && (
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">You're at the Highest Tier!</h3>
                      <p className="text-sm text-gray-600">You're already enjoying all the premium benefits of Platinum membership.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-emerald-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Total</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-green-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Active</div>
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-amber-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Bronze</div>
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.byTier.bronze || 0}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-gray-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Silver</div>
              </div>
              <div className="text-2xl font-bold text-gray-600">{stats.byTier.silver || 0}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-yellow-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Gold</div>
              </div>
              <div className="text-2xl font-bold text-yellow-600">{stats.byTier.gold || 0}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-purple-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Platinum</div>
              </div>
              <div className="text-2xl font-bold text-purple-600">{stats.byTier.platinum || 0}</div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Search & Filter</h2>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by member name..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-12 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="">All Tiers</option>
                    {TIERS.map(tier => (
                      <option key={tier.value} value={tier.value}>{tier.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No memberships found</h2>
                <p className="text-sm text-gray-600 font-medium">No membership records match your filters.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Member</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Membership #</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Tier</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Points</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Discount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
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
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors mr-2"
                        >
                          View
                        </button>
                        <select
                          onChange={(e) => {
                            if (e.target.value) handleUpgradeTier(membership, e.target.value);
                            e.target.value = '';
                          }}
                          className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
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
              <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Membership Details</h2>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
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
                        className="mt-4 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all font-semibold shadow-md"
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
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Adjust Points</h2>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Transaction Type</label>
                    <select
                      value={pointsForm.type}
                      onChange={(e) => setPointsForm({ ...pointsForm, type: e.target.value as any })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    >
                      <option value="earn">Earn (Add Points)</option>
                      <option value="redeem">Redeem (Use Points)</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Points</label>
                    <input
                      type="number"
                      value={pointsForm.points}
                      onChange={(e) => setPointsForm({ ...pointsForm, points: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={pointsForm.description}
                      onChange={(e) => setPointsForm({ ...pointsForm, description: e.target.value })}
                      placeholder="e.g., Visit reward, Manual adjustment"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={() => setShowPointsModal(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPoints}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all font-semibold shadow-md"
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

