'use client';

import { useState, useEffect, useCallback } from 'react';

interface Room {
  _id: string;
  name: string;
  roomNumber?: string;
  floor?: number;
  building?: string;
  roomType: 'consultation' | 'examination' | 'procedure' | 'surgery' | 'other';
  capacity?: number;
  equipment?: string[];
  amenities?: string[];
  status: 'available' | 'occupied' | 'maintenance' | 'unavailable';
  notes?: string;
  createdAt: string;
}

interface RoomsManagementClientProps {
  user: { role: string; [key: string]: any };
}

const ROOM_TYPES = [
  { value: 'consultation', label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  { value: 'examination', label: 'Examination', color: 'bg-green-100 text-green-800' },
  { value: 'procedure', label: 'Procedure', color: 'bg-purple-100 text-purple-800' },
  { value: 'surgery', label: 'Surgery', color: 'bg-red-100 text-red-800' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-800' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', color: 'bg-green-100 text-green-800' },
  { value: 'occupied', label: 'Occupied', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-orange-100 text-orange-800' },
  { value: 'unavailable', label: 'Unavailable', color: 'bg-red-100 text-red-800' },
];

export default function RoomsManagementClient({ user }: RoomsManagementClientProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    roomNumber: '',
    floor: 1,
    building: 'Main Building',
    roomType: 'consultation' as Room['roomType'],
    capacity: 4,
    equipment: '',
    amenities: '',
    status: 'available' as Room['status'],
    notes: '',
  });

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter) params.set('roomType', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/rooms?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRooms(Array.isArray(data) ? data : data.rooms || []);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        equipment: formData.equipment.split(',').map(s => s.trim()).filter(Boolean),
        amenities: formData.amenities.split(',').map(s => s.trim()).filter(Boolean),
      };

      const url = editingRoom ? `/api/rooms/${editingRoom._id}` : '/api/rooms';
      const method = editingRoom ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Room saved successfully');
        setTimeout(() => setSuccess(null), 3000);
        setShowModal(false);
        resetForm();
        fetchRooms();
      } else {
        setError(data.error || 'Failed to save room');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (room: Room) => {
    if (!confirm(`Are you sure you want to delete "${room.name}"?`)) return;

    try {
      const response = await fetch(`/api/rooms/${room._id}`, { method: 'DELETE' });

      if (response.ok) {
        setSuccess('Room deleted successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchRooms();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete room');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      roomNumber: room.roomNumber || '',
      floor: room.floor || 1,
      building: room.building || 'Main Building',
      roomType: room.roomType,
      capacity: room.capacity || 4,
      equipment: room.equipment?.join(', ') || '',
      amenities: room.amenities?.join(', ') || '',
      status: room.status,
      notes: room.notes || '',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingRoom(null);
    setFormData({
      name: '',
      roomNumber: '',
      floor: 1,
      building: 'Main Building',
      roomType: 'consultation',
      capacity: 4,
      equipment: '',
      amenities: '',
      status: 'available',
      notes: '',
    });
  };

  const getTypeBadge = (type: string) => {
    const t = ROOM_TYPES.find(rt => rt.value === type);
    return t ? (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${t.color}`}>
        {t.label}
      </span>
    ) : type;
  };

  const getStatusBadge = (status: string) => {
    const s = STATUS_OPTIONS.find(st => st.value === status);
    return s ? (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${s.color}`}>
        {s.label}
      </span>
    ) : status;
  };

  // Count by status
  const statusCounts = rooms.reduce((acc, room) => {
    acc[room.status] = (acc[room.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-700">Loading rooms...</p>
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
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Rooms Management</h1>
              <p className="text-sm text-gray-500">Manage clinic rooms and their availability</p>
            </div>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Room
            </button>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[120px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Total</div>
                <div className="text-2xl font-bold">{rooms.length}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[120px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Available</div>
                <div className="text-2xl font-bold text-green-600">{statusCounts.available || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[120px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Occupied</div>
                <div className="text-2xl font-bold text-yellow-600">{statusCounts.occupied || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[120px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Maintenance</div>
                <div className="text-2xl font-bold text-orange-600">{statusCounts.maintenance || 0}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[120px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Unavailable</div>
                <div className="text-2xl font-bold text-red-600">{statusCounts.unavailable || 0}</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Type Dropdown */}
                <div style={{ minWidth: '150px' }}>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Types</option>
                    {ROOM_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div style={{ minWidth: '150px' }}>
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

          {/* Rooms Grid */}
          {rooms.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-8 text-center">
                <div className="mb-3">
                  <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-1">No rooms found</h2>
                <p className="text-sm text-gray-500 mb-3">Get started by adding your first room.</p>
                <button
                  onClick={() => { resetForm(); setShowModal(true); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add First Room
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div key={room._id} className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                        <p className="text-sm text-gray-500">
                          {room.building}{room.floor ? `, Floor ${room.floor}` : ''}
                        </p>
                      </div>
                      {getStatusBadge(room.status)}
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Type:</span>
                      {getTypeBadge(room.roomType)}
                    </div>
                    {room.roomNumber && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Room #:</span>
                        <span className="font-mono">{room.roomNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Capacity:</span>
                      <span>{room.capacity || '-'} persons</span>
                    </div>
                    {room.equipment && room.equipment.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Equipment:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {room.equipment.slice(0, 3).map((eq, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              {eq}
                            </span>
                          ))}
                          {room.equipment.length > 3 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              +{room.equipment.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-1">
                    <button
                      onClick={() => handleEdit(room)}
                      className="p-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(room)}
                      className="p-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold">
                  {editingRoom ? 'Edit Room' : 'Add New Room'}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Consultation Room A"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Room Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                    <input
                      type="text"
                      value={formData.roomNumber}
                      onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                      placeholder="e.g., 101"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Room Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room Type *</label>
                    <select
                      value={formData.roomType}
                      onChange={(e) => setFormData({ ...formData, roomType: e.target.value as Room['roomType'] })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {ROOM_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Building */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Building</label>
                    <input
                      type="text"
                      value={formData.building}
                      onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Floor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
                    <input
                      type="number"
                      value={formData.floor}
                      onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) || 1 })}
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Capacity */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as Room['status'] })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {STATUS_OPTIONS.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Equipment */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Equipment</label>
                    <input
                      type="text"
                      value={formData.equipment}
                      onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                      placeholder="Comma separated (e.g., Exam table, Monitor, Stethoscope)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Amenities */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amenities</label>
                    <input
                      type="text"
                      value={formData.amenities}
                      onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
                      placeholder="Comma separated (e.g., Air conditioning, WiFi)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : editingRoom ? 'Update Room' : 'Create Room'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
