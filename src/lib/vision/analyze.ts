import UploadManager from '@/lib/uploads/manager';
import BaseLLM from '@/lib/models/base/llm';
import fs from 'fs';
import path from 'path';

const uploadsDir = path.join(process.cwd(), 'data', 'uploads');

function imageToBase64(filePath: string, mimeType: string): string {
  const buffer = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] || 'image/png';
}

export async function analyzeImagesWithVLM(
  llm: BaseLLM<any>,
  imageFileIds: string[],
  userQuery: string,
): Promise<string> {
  const images: string[] = [];

  for (const fileId of imageFileIds) {
    const file = UploadManager.getFile(fileId);
    if (!file || !fs.existsSync(file.filePath)) continue;
    const mime = getMimeType(file.filePath);
    const dataUrl = imageToBase64(file.filePath, mime);
    images.push(dataUrl);
  }

  if (images.length === 0) return '';

  const response = await llm.generateText({
    messages: [
      {
        role: 'user',
        content: `You are an expert image analyst. Analyze the provided image(s) carefully and describe what you see in detail. Focus on facts, text, objects, people, and any information relevant to answering the user's question. Be thorough and precise.

User's question: ${userQuery}`,
        images,
      },
    ],
  });

  return response.content;
}
