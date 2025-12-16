import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    // Convert slug back to filename (uppercase with underscores)
    // slug is like "patient-journey" -> "PATIENT_JOURNEY.md"
    const filename = slug.toUpperCase().replace(/-/g, '_') + '.md';
    
    const filePath = join(process.cwd(), 'docs', filename);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      
      // Extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '').replace(/_/g, ' ');
      
      return NextResponse.json({
        filename,
        slug,
        title,
        content,
      });
    } catch (fileError: any) {
      // If file not found, try to find it by reading directory
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(join(process.cwd(), 'docs'));
        const matchingFile = files.find(f => 
          f.toLowerCase().replace(/_/g, '-').replace('.md', '') === slug.toLowerCase()
        );
        
        if (matchingFile) {
          const altFilePath = join(process.cwd(), 'docs', matchingFile);
          const content = await readFile(altFilePath, 'utf-8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : matchingFile.replace('.md', '').replace(/_/g, ' ');
          
          return NextResponse.json({
            filename: matchingFile,
            slug,
            title,
            content,
          });
        }
      } catch {}
      
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Error reading document:', error);
    return NextResponse.json(
      { error: 'Failed to read document' },
      { status: 500 }
    );
  }
}

