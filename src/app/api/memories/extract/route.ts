import { NextResponse } from 'next/server';
import { extractMemories } from '@/lib/memory/extractor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('[API] Manual memory extraction triggered');
    const result = await extractMemories();
    return NextResponse.json({
      success: true,
      extracted: result.extracted,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[API] Memory extraction failed:', err);
    return NextResponse.json(
      { error: 'Extraction failed' },
      { status: 500 },
    );
  }
}
