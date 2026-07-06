import { NextRequest, NextResponse } from 'next/server';
import memoryStore from '@/lib/memory/store';
import { z } from 'zod';

const createMemorySchema = z.object({
  content: z.string().min(1, 'Content is required'),
  category: z
    .enum(['personal_info', 'preference', 'fact', 'project', 'other'])
    .default('other'),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || undefined;
    const memoriesList = await memoryStore.listMemories(search);
    const count = await memoryStore.countMemories();

    return NextResponse.json({ memories: memoriesList, count });
  } catch (err) {
    console.error('Error fetching memories:', err);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createMemorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const memory = await memoryStore.addMemory({
      content: parsed.data.content,
      category: parsed.data.category,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    console.error('Error creating memory:', err);
    return NextResponse.json(
      { error: 'Failed to create memory' },
      { status: 500 },
    );
  }
}
