import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import KnowledgeBaseLayoutClient from '@/components/KnowledgeBaseLayoutClient';

interface DocFile {
  filename: string;
  slug: string;
  title: string;
  description: string;
  size: number;
}

async function getDocsFiles(): Promise<DocFile[]> {
  try {
    const docsPath = join(process.cwd(), 'docs');
    const files = await readdir(docsPath);
    
    // Filter only .md files and get their metadata
    const markdownFiles = await Promise.all(
      files
        .filter(file => file.endsWith('.md'))
        .map(async (file) => {
          const filePath = join(docsPath, file);
          const content = await readFile(filePath, 'utf-8');
          
          // Extract title from first heading or filename
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '').replace(/_/g, ' ');
          
          // Extract description from first paragraph after title
          const lines = content.split('\n');
          let description = 'No description available';
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#') && i + 2 < lines.length && lines[i + 1].trim() === '') {
              const desc = lines[i + 2].trim();
              if (desc && !desc.startsWith('#')) {
                description = desc.substring(0, 200);
                break;
              }
            }
          }
          
          // Create slug from filename (convert to lowercase with hyphens)
          const slug = file.replace('.md', '').toLowerCase().replace(/_/g, '-');
          
          return {
            filename: file,
            slug,
            title,
            description,
            size: content.length,
          };
        })
    );
    
    // Sort by filename
    markdownFiles.sort((a, b) => a.filename.localeCompare(b.filename));
    
    return markdownFiles;
  } catch (error) {
    console.error('Error reading docs directory:', error);
    return [];
  }
}

export default async function KnowledgeBaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const files = await getDocsFiles();
  
  // Group files by category
  const categories: Record<string, DocFile[]> = {
    'Journeys': [],
    'Setup & Configuration': [],
    'Features': [],
    'Other': [],
  };
  
  files.forEach(file => {
    if (file.filename.includes('JOURNEY')) {
      categories['Journeys'].push(file);
    } else if (
      file.filename.includes('SETUP') || 
      file.filename.includes('DEPLOYMENT') ||
      file.filename.includes('CLOUDINARY') ||
      file.filename.includes('PAYPAL') ||
      file.filename.includes('SMS') ||
      file.filename.includes('CRON')
    ) {
      categories['Setup & Configuration'].push(file);
    } else if (
      file.filename.includes('BILLING') ||
      file.filename.includes('DOCUMENT') ||
      file.filename.includes('EPRESCRIPTION') ||
      file.filename.includes('LABORATORY') ||
      file.filename.includes('ROOM') ||
      file.filename.includes('NOTIFICATIONS') ||
      file.filename.includes('MEMBERSHIP') ||
      file.filename.includes('DASHBOARD')
    ) {
      categories['Features'].push(file);
    } else {
      categories['Other'].push(file);
    }
  });

  return (
    <KnowledgeBaseLayoutClient files={files} categories={categories}>
      {children}
    </KnowledgeBaseLayoutClient>
  );
}

