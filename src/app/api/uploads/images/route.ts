import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
const uploadedFilesRecordPath = path.join(uploadsDir, 'uploaded_files.json');

const supportedImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function getRecordedFiles(): any[] {
  if (!fs.existsSync(uploadedFilesRecordPath)) return [];
  const data = fs.readFileSync(uploadedFilesRecordPath, 'utf-8');
  return JSON.parse(data).files;
}

function addRecordedFile(fileRecord: any) {
  const current = getRecordedFiles();
  current.push(fileRecord);
  fs.writeFileSync(uploadedFilesRecordPath, JSON.stringify({ files: current }, null, 2));
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const processedFiles = await Promise.all(
      files.map(async (file) => {
        if (!supportedImageTypes.includes(file.type)) {
          throw new Error(`Unsupported image type: ${file.type}`);
        }

        const fileId = crypto.randomBytes(16).toString('hex');
        const ext = file.name.split('.').pop();
        const fileName = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
        const filePath = path.join(uploadsDir, fileName);
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        addRecordedFile({
          id: fileId,
          name: file.name,
          filePath,
          contentPath: '',
          uploadedAt: new Date().toISOString(),
        });

        return {
          fileName: file.name,
          fileExtension: ext || '',
          fileId,
        };
      }),
    );

    return NextResponse.json({ files: processedFiles });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
}
