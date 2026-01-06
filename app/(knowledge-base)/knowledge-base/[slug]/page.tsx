import MarkdownRenderer from '@/components/MarkdownRenderer';
import { notFound } from 'next/navigation';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';

interface DocArticle {
  filename: string;
  slug: string;
  title: string;
  content: string;
}

async function getArticle(slug: string): Promise<DocArticle | null> {
  try {
    const filename = slug.toUpperCase().replace(/-/g, '_') + '.md';
    const filePath = join(process.cwd(), 'docs', filename);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '').replace(/_/g, ' ');
      
      return {
        filename,
        slug,
        title,
        content,
      };
    } catch {
      const docsPath = join(process.cwd(), 'docs');
      const files = await readdir(docsPath);
      const matchingFile = files.find(f => 
        f.toLowerCase().replace(/_/g, '-').replace('.md', '') === slug.toLowerCase()
      );
      
      if (matchingFile) {
        const altFilePath = join(docsPath, matchingFile);
        const content = await readFile(altFilePath, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : matchingFile.replace('.md', '').replace(/_/g, ' ');
        
        return {
          filename: matchingFile,
          slug,
          title,
          content,
        };
      }
      
      return null;
    }
  } catch (error) {
    console.error('Error reading article:', error);
    return null;
  }
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);
  
  if (!article) {
    notFound();
  }

  return (
    <article>
      {/* Breadcrumbs */}
      <nav className="mb-3" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-1.5 text-xs text-gray-500">
          <li>
            <Link href="/knowledge-base" className="hover:text-gray-700 transition-colors">
              Docs
            </Link>
          </li>
          <li>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </li>
          <li className="text-gray-900 font-medium truncate" aria-current="page">
            {article.title}
          </li>
        </ol>
      </nav>

      {/* Article Header */}
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5 leading-tight">
          {article.title}
        </h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
            {article.filename}
          </span>
        </div>
      </header>

      {/* Article Content */}
      <div className="prose prose-slate max-w-none">
        <MarkdownRenderer content={article.content} />
      </div>
    </article>
  );
}
