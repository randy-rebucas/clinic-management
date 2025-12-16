'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DocFile {
  filename: string;
  slug: string;
  title: string;
  description: string;
  size: number;
}

interface KnowledgeBaseLayoutClientProps {
  files: DocFile[];
  categories: Record<string, DocFile[]>;
  children: React.ReactNode;
}

export default function KnowledgeBaseLayoutClient({
  files,
  categories,
  children,
}: KnowledgeBaseLayoutClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(Object.keys(categories)));
  const pathname = usePathname();
  const currentSlug = pathname.split('/').pop() || '';

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const activeCategory = Object.entries(categories).find(([_, files]) =>
      files.some(f => f.slug === currentSlug)
    )?.[0];
    if (activeCategory) {
      setExpandedCategories(prev => new Set([...prev, activeCategory]));
    }
  }, [currentSlug, categories]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return categories;
    }

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, DocFile[]> = {};

    Object.entries(categories).forEach(([category, categoryFiles]) => {
      const matchingFiles = categoryFiles.filter(
        file =>
          file.title.toLowerCase().includes(query) ||
          file.filename.toLowerCase().includes(query) ||
          file.description.toLowerCase().includes(query)
      );

      if (matchingFiles.length > 0) {
        filtered[category] = matchingFiles;
      }
    });

    return filtered;
  }, [categories, searchQuery]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky left-0 top-0 z-30
          w-64 bg-white border-r border-gray-200
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
          shadow-2xl lg:shadow-none
          h-full
        `}
        style={{
          top: '0',
          height: 'calc(100vh - 0)',
        }}
      >
        {/* Sidebar Header */}
        <div className="p-2.5 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Link href="/knowledge-base" className="flex items-center gap-1.5 group">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center group-hover:from-blue-700 group-hover:to-indigo-700 transition-colors">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">Docs</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 pl-7 pr-7 text-sm bg-gray-50 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
            />
            <svg
              className="absolute left-2 top-1.5 w-3.5 h-3.5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1.5 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-1.5">
            {Object.keys(filteredCategories).length === 0 && searchQuery ? (
              <div className="text-center py-6">
                <p className="text-xs font-medium text-gray-500 mb-1">No results</p>
                <p className="text-xs text-gray-400">Try different keywords</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {Object.entries(filteredCategories).map(([category, categoryFiles]) => {
                  if (categoryFiles.length === 0) return null;
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <div key={category} className="mb-1.5">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider hover:bg-gray-50 rounded transition-colors"
                      >
                        <span>{category}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {categoryFiles.length}
                          </span>
                          <svg
                            className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && (
                        <ul className="mt-0.5 space-y-0.5 pl-1">
                          {categoryFiles.map((file) => {
                            const isActive = currentSlug === file.slug;
                            
                            return (
                              <li key={file.slug}>
                                <Link
                                  href={`/knowledge-base/${file.slug}`}
                                  className={`
                                    block px-2 py-1 text-sm rounded transition-colors
                                    ${
                                      isActive
                                        ? 'bg-blue-50 text-blue-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }
                                  `}
                                >
                                  <span className="truncate block">{file.title}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          style={{ top: '4rem' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-20 left-4 z-40 p-2 rounded-md bg-white border border-gray-200 shadow-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-white scroll-smooth">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-8 py-4 lg:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
