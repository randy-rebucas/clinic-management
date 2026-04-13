'use client';

import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SegmentationFilterProps {
  selectedTags: string[];
  selectedFlags: Record<string, boolean>;
  availableTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFlagsChange: (flags: Record<string, boolean>) => void;
}

interface SegmentFlag {
  key: string;
  label: string;
  color: string;
}

const SEGMENT_FLAGS: SegmentFlag[] = [
  { key: 'isVIP', label: 'VIP Patients', color: 'bg-purple-100 text-purple-800' },
  { key: 'isHighRisk', label: 'High Risk', color: 'bg-red-100 text-red-800' },
  { key: 'isHighUtilizer', label: 'High Utilizer', color: 'bg-blue-100 text-blue-800' },
  { key: 'hasRecurringNoShow', label: 'Recurring No-Show', color: 'bg-orange-100 text-orange-800' },
  { key: 'isPendingVerification', label: 'Pending Verification', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'hasOutstandingBalance', label: 'Outstanding Balance', color: 'bg-amber-100 text-amber-800' },
];

export function PatientSegmentationFilter({
  selectedTags,
  selectedFlags,
  availableTags,
  onTagsChange,
  onFlagsChange,
}: SegmentationFilterProps) {
  const [expandedSection, setExpandedSection] = useState<'tags' | 'flags' | null>(null);
  const [tagInput, setTagInput] = useState('');

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }, []);

  const handleFlagToggle = useCallback((flagKey: string) => {
    onFlagsChange({
      ...selectedFlags,
      [flagKey]: !selectedFlags[flagKey],
    });
  }, [selectedFlags, onFlagsChange]);

  const handleAddCustomTag = useCallback(() => {
    if (tagInput.trim()) {
      const newTag = tagInput.trim().toLowerCase();
      if (!selectedTags.includes(newTag) && !availableTags.includes(newTag)) {
        onTagsChange([...selectedTags, newTag]);
        setTagInput('');
      }
    }
  }, [tagInput, selectedTags, availableTags, onTagsChange]);

  const activeSegmentCount = Object.values(selectedFlags).filter(Boolean).length;
  const totalActiveFilters = selectedTags.length + activeSegmentCount;

  const setSelectedTags = useCallback((fn: (prev: string[]) => string[]) => {
    onTagsChange(fn(selectedTags));
  }, [selectedTags, onTagsChange]);

  return (
    <div className="space-y-3">
      {/* Tags Section */}
      <div className="border rounded-lg">
        <button
          onClick={() => setExpandedSection(expandedSection === 'tags' ? null : 'tags')}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
          aria-expanded={expandedSection === 'tags'}
          aria-label="Toggle patient tags filter"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Patient Tags</span>
            {selectedTags.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {selectedTags.length}
              </span>
            )}
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform ${expandedSection === 'tags' ? 'rotate-180' : ''}`}
          />
        </button>

        {expandedSection === 'tags' && (
          <div className="border-t p-3 space-y-3 bg-gray-50">
            {/* Available tags */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">
                Available Tags: {availableTags.length}
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    aria-pressed={selectedTags.includes(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom tag input */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">
                Add Custom Tag:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTag()}
                  placeholder="Type tag name..."
                  className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Enter custom tag"
                />
                <button
                  onClick={handleAddCustomTag}
                  className="text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  aria-label="Add custom tag"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Selected tags */}
            {selectedTags.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">
                  Selected: {selectedTags.length}
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-colors"
                      aria-label={`Remove ${tag} tag`}
                    >
                      ✕ {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Segment Flags Section */}
      <div className="border rounded-lg">
        <button
          onClick={() => setExpandedSection(expandedSection === 'flags' ? null : 'flags')}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
          aria-expanded={expandedSection === 'flags'}
          aria-label="Toggle patient segment flags filter"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Patient Segments</span>
            {activeSegmentCount > 0 && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                {activeSegmentCount}
              </span>
            )}
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform ${expandedSection === 'flags' ? 'rotate-180' : ''}`}
          />
        </button>

        {expandedSection === 'flags' && (
          <div className="border-t p-3 space-y-2 bg-gray-50">
            {SEGMENT_FLAGS.map(({ key, label, color }) => (
              <label
                key={key}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedFlags[key] || false}
                  onChange={() => handleFlagToggle(key)}
                  className="w-4 h-4 rounded cursor-pointer"
                  aria-label={label}
                />
                <span className={`text-xs px-2 py-1 rounded-full ${color}`}>
                  {label}
                </span>
              </label>
            ))}

            {activeSegmentCount === 0 && (
              <p className="text-xs text-gray-500 italic p-2">No segments selected</p>
            )}
          </div>
        )}
      </div>

      {/* Clear filters button */}
      {totalActiveFilters > 0 && (
        <button
          onClick={() => {
            onTagsChange([]);
            onFlagsChange({});
            setExpandedSection(null);
          }}
          className="w-full text-sm px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          aria-label="Clear all segmentation filters"
        >
          Clear All Filters ({totalActiveFilters})
        </button>
      )}
    </div>
  );
}
