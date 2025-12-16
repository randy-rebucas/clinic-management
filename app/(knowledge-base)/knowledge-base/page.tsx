import { redirect } from 'next/navigation';
import { readdir } from 'fs/promises';
import { join } from 'path';

async function getFirstDocSlug(): Promise<string | null> {
  try {
    const docsPath = join(process.cwd(), 'docs');
    const files = await readdir(docsPath);
    const mdFiles = files.filter(file => file.endsWith('.md')).sort();
    
    if (mdFiles.length === 0) return null;
    
    const firstFile = mdFiles[0];
    return firstFile.replace('.md', '').toLowerCase().replace(/_/g, '-');
  } catch (error) {
    return null;
  }
}

export default async function KnowledgeBasePage() {
  // Redirect to first document if no slug is provided
  const firstSlug = await getFirstDocSlug();
  
  if (firstSlug) {
    redirect(`/knowledge-base/${firstSlug}`);
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
      <p className="text-gray-600">No documentation files found.</p>
    </div>
  );
}

