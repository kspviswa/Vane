import db from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const DEFAULT_SETTINGS: Record<string, any> = {
  theme: 'dark',
  measureUnit: 'Metric',
  autoMediaSearch: true,
  showWeatherWidget: true,
  showNewsWidget: true,
  userName: '',
  location: '',
  systemInstructions: '',
  aboutMe: '',
  enableMemories: true,
  chatModelProviderId: '',
  chatModelKey: '',
  embeddingModelProviderId: '',
  embeddingModelKey: '',
  visionModelProviderId: '',
  visionModelKey: '',
  contextLength: '8192',
};

function serialize(value: any): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function deserialize(value: any, originalValue: any): any {
  if (typeof originalValue === 'boolean') {
    return value === 'true' || value === true;
  }
  return value;
}

export async function getAllSettings(): Promise<Record<string, any>> {
  let row = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .get();

  if (!row) {
    const now = new Date().toISOString();
    await db.insert(settings).values({
      id: 1,
      data: DEFAULT_SETTINGS,
      updatedAt: now,
    });
    row = await db
      .select()
      .from(settings)
      .where(eq(settings.id, 1))
      .get();
  }

  return { ...DEFAULT_SETTINGS, ...row?.data };
}

export async function updateSettings(
  updates: Record<string, any>,
): Promise<Record<string, any>> {
  const current = await getAllSettings();
  const merged = { ...current, ...updates };
  const now = new Date().toISOString();

  await db
    .insert(settings)
    .values({ id: 1, data: merged, updatedAt: now })
    .onConflictDoUpdate({ target: settings.id, set: { data: merged, updatedAt: now } });

  return merged;
}
