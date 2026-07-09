import z from 'zod';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import ModelRegistry from '@/lib/models/registry';
import memoryStore from './store';
import { MemoryCategory } from './types';
import { getAllSettings } from '@/lib/config/settings';

const extractionSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().min(1),
      category: z.enum([
        'personal_info',
        'preference',
        'fact',
        'project',
        'other',
      ]),
    }),
  ),
});

const EXTRACTOR_PROMPT = `You are an AI assistant that extracts personal facts about a user from their conversation history.
Your task is to identify and extract important personal information that the user has explicitly shared.

Focus on extracting:
- Name, profession, skills, education
- Location, language
- Preferences, interests, hobbies
- Personal circumstances (e.g., "I'm married", "I have two kids", "I live in...")
- Goals, aspirations, projects they're working on
- Any factual statements about themselves

Rules:
- ONLY extract explicit statements directly from the user's messages
- Do NOT infer, assume, or guess anything not directly stated
- If no personal information is found, return an empty array
- Each memory should be a concise fact statement written in third person (e.g., "User lives in Paris", "User is a software architect", "User prefers dark mode")
- Skip greetings, pleasantries, and non-informational messages
- The category should be one of: personal_info, preference, fact, project, other

User messages:
{{messages}}`;

function buildExtractionPrompt(messagesText: string): string {
  return EXTRACTOR_PROMPT.replace('{{messages}}', messagesText);
}

export async function extractMemories(): Promise<{
  extracted: number;
  errors: number;
}> {
  const settings = await getAllSettings();
  const chatProviderId = settings.chatModelProviderId;
  const chatModelKey = settings.chatModelKey;

  if (!chatProviderId || !chatModelKey) {
    console.log('[Memory] No chat model configured in settings, skipping');
    return { extracted: 0, errors: 0 };
  }

  const registry = new ModelRegistry();

  if (registry.activeProviders.length === 0) {
    console.log('[Memory] No active providers found, skipping extraction');
    return { extracted: 0, errors: 0 };
  }

  const llm = await registry.loadChatModel(chatProviderId, chatModelKey);

  let embeddingModel = null;
  for (const p of registry.activeProviders) {
    try {
      const models = await p.provider.getModelList();
      if (models.embedding.length > 0) {
        embeddingModel = await registry.loadEmbeddingModel(p.id, models.embedding[0].key);
        memoryStore.setEmbeddingModel(embeddingModel);
        console.log(`[Memory] Using embedding model: ${p.name} / ${models.embedding[0].key}`);
        break;
      }
    } catch (err) {
      console.warn(`[Memory] Provider ${p.name} has no usable embedding model:`, err);
    }
  }

  const unprocessed = await memoryStore.getUnprocessedMessages();

  if (unprocessed.length === 0) {
    console.log('[Memory] No unprocessed messages found');
    return { extracted: 0, errors: 0 };
  }

  console.log(
    `[Memory] Processing ${unprocessed.length} unprocessed messages with chat model ${chatProviderId}/${chatModelKey}`,
  );

  const BATCH_SIZE = 15;
  let totalExtracted = 0;
  let totalErrors = 0;

  for (let i = 0; i < unprocessed.length; i += BATCH_SIZE) {
    const batch = unprocessed.slice(i, i + BATCH_SIZE);
    const messagesText = batch.map((m) => m.query).join('\n---\n');

    try {
      const result = (await llm.generateObject({
        messages: [
          { role: 'system', content: buildExtractionPrompt(messagesText) },
          { role: 'user', content: 'Extract personal facts from these messages.' },
        ],
        schema: extractionSchema,
      })) as z.infer<typeof extractionSchema>;

      if (result.memories && result.memories.length > 0) {
        for (const fact of result.memories) {
          const existing = await memoryStore.queryMemories(fact.content, 1, 0.92);
          if (existing.length > 0) continue;

          await memoryStore.addMemory({
            content: fact.content,
            category: fact.category as MemoryCategory,
          });
          totalExtracted++;
        }
      }

      // Mark all messages in this batch as processed
      const now = new Date().toISOString();
      for (const msg of batch) {
        await db
          .update(messages)
          .set({ extractedAt: now })
          .where(eq(messages.messageId, msg.messageId))
          .execute();
      }
    } catch (err) {
      console.error('[Memory] Error processing batch:', err);
      totalErrors++;
    }
  }

  console.log(
    `[Memory] Extraction complete: ${totalExtracted} new memories, ${totalErrors} errors`,
  );

  return { extracted: totalExtracted, errors: totalErrors };
}
