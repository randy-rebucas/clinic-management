import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
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
          const descriptionMatch = content.match(/^#[\s\S]+\n\n([\s\S]+?)(?:\n\n|$)/);
          const description = descriptionMatch 
            ? descriptionMatch[1].trim().substring(0, 200) 
            : 'No description available';
          
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
    
    return NextResponse.json({ files: markdownFiles });
  } catch (error: any) {
    console.error('Error reading docs directory:', error);
    return NextResponse.json(
      { error: 'Failed to read documentation files' },
      { status: 500 }
    );
  }
}

