import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import UploadManager from '@/lib/uploads/manager';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    const file = UploadManager.getFile(fileId);
    if (!file) {
      return NextResponse.json({ message: 'File not found' }, { status: 404 });
    }
    if (!fs.existsSync(file.filePath)) {
      return NextResponse.json({ message: 'File not found on disk' }, { status: 404 });
    }
    const ext = path.extname(file.filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(file.filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${file.name}"`,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('Error serving file:', err);
    return NextResponse.json({ message: 'An error occurred' }, { status: 500 });
  }
}
