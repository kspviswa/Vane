import { NextRequest, NextResponse } from 'next/server';
import memoryStore from '@/lib/memory/store';
import { z } from 'zod';

const updateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  category: z
    .enum(['personal_info', 'preference', 'fact', 'project', 'other'])
    .optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateMemorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const memory = await memoryStore.updateMemory(id, parsed.data);

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ memory });
  } catch (err) {
    console.error('Error updating memory:', err);
    return NextResponse.json(
      { error: 'Failed to update memory' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await memoryStore.deleteMemory(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting memory:', err);
    return NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 },
    );
  }
}
