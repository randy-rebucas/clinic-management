'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        h1: ({ node, ...props }) => (
          <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-4 first:mt-0" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-xl font-bold text-gray-900 mt-6 mb-3 scroll-mt-20" id={props.id || undefined} {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="text-lg font-semibold text-gray-900 mt-5 mb-2 scroll-mt-20" id={props.id || undefined} {...props} />
        ),
        h4: ({ node, ...props }) => (
          <h4 className="text-base font-semibold text-gray-900 mt-4 mb-2" {...props} />
        ),
        p: ({ node, ...props }) => (
          <p className="text-gray-700 leading-7 mb-4 text-sm" {...props} />
        ),
        ul: ({ node, ...props }) => (
          <ul className="list-disc list-outside mb-4 space-y-1.5 text-gray-700 ml-5" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal list-outside mb-4 space-y-1.5 text-gray-700 ml-5" {...props} />
        ),
        li: ({ node, ...props }) => (
          <li className="pl-1" {...props} />
        ),
        code: ({ node, inline, ...props }: any) => {
          if (inline) {
            return (
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200" {...props} />
            );
          }
          return (
            <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto mb-4 font-mono text-xs leading-relaxed" {...props} />
          );
        },
        pre: ({ node, ...props }) => (
          <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto mb-4 shadow-lg" {...props} />
        ),
        blockquote: ({ node, ...props }) => (
          <blockquote className="border-l-4 border-blue-500 pl-3 italic text-gray-600 my-4 bg-blue-50 py-2 rounded-r-lg" {...props} />
        ),
        a: ({ node, ...props }) => (
          <a className="text-blue-600 hover:text-blue-700 underline font-medium transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
        ),
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-4 shadow-sm rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200" {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => (
          <thead className="bg-gray-50" {...props} />
        ),
        th: ({ node, ...props }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="px-3 py-2 text-sm text-gray-700 border-t border-gray-100" {...props} />
        ),
        hr: ({ node, ...props }) => (
          <hr className="my-6 border-0 border-t border-gray-200" {...props} />
        ),
        strong: ({ node, ...props }) => (
          <strong className="font-semibold text-gray-900" {...props} />
        ),
        em: ({ node, ...props }) => (
          <em className="italic text-gray-700" {...props} />
        ),
        img: ({ node, ...props }) => (
          <img className="rounded-lg shadow-md my-4 max-w-full" {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
