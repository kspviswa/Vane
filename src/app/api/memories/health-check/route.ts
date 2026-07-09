import { NextResponse } from 'next/server';
import { z } from 'zod';
import memoryStore from '@/lib/memory/store';
import ModelRegistry from '@/lib/models/registry';
import { getAllSettings } from '@/lib/config/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  type: z.enum(['delete', 'update']),
  id: z.string(),
  newContent: z.string().optional(),
  newCategory: z
    .enum(['personal_info', 'preference', 'fact', 'project', 'other'])
    .optional(),
  reason: z.string(),
});

const healthCheckOutputSchema = z.object({
  actions: z.array(actionSchema),
});

const HEALTH_CHECK_PROMPT = `You are a memory curator. Your job is to clean up and optimize a user's personal memory store.

You will receive a list of memories (personal facts, preferences, project info, etc. about the user).

Apply these strategies in order:

1. **DEDUPLICATE**: If two or more memories say the same thing (exact or near-exact duplicates), pick the best-written one and mark the others for deletion.

2. **MERGE RELATED**: If multiple memories cover the same topic (e.g. "User lives in Paris" + "User's apartment is in Le Marais, Paris"), merge them into one comprehensive fact. The merged entry should be assigned to the most relevant original ID; the others are deleted.

3. **SUMMARIZE & PARAPHRASE**: If a memory is overly verbose or poorly worded, rewrite it concisely while preserving all factual information. Aim for 10-20 words per memory. Use third-person ("User ...").

4. **REMOVE LOW-VALUE**: Delete memories that are trivial, outdated, or not useful (e.g. "User said hello", "User is currently eating lunch").

5. **RECATEGORIZE**: If a memory's category is wrong, assign the correct one.

Rules:
- NEVER invent or infer information not present in the original memories
- Preserve all factual details when merging or paraphrasing
- When merging, the kept memory's content should be a superset of all merged facts
- Return an action ONLY for memories that need to change or be deleted
- Memories not listed in actions are kept as-is
- Provide a brief reason for each action`;

export async function POST() {
  try {
    const settings = await getAllSettings();
    const chatProviderId = settings.chatModelProviderId;
    const chatModelKey = settings.chatModelKey;

    if (!chatProviderId || !chatModelKey) {
      return NextResponse.json(
        { error: 'No chat model configured in settings' },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry();

    if (registry.activeProviders.length === 0) {
      return NextResponse.json(
        { error: 'No active providers found' },
        { status: 400 },
      );
    }

    const llm = await registry.loadChatModel(chatProviderId, chatModelKey);
    const allMemories = await memoryStore.listMemories();
    const totalBefore = allMemories.length;

    if (totalBefore === 0) {
      return NextResponse.json({
        success: true,
        totalBefore: 0,
        totalAfter: 0,
        deleted: 0,
        updated: 0,
        details: [],
      });
    }

    const BATCH_SIZE = 50;
    let totalDeleted = 0;
    let totalUpdated = 0;
    const allDetails: { id: string; type: string; reason: string }[] = [];

    for (let i = 0; i < allMemories.length; i += BATCH_SIZE) {
      const batch = allMemories.slice(i, i + BATCH_SIZE);
      const memoriesForLLM = batch.map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
      }));

      const result = (await llm.generateObject({
        messages: [
          {
            role: 'system',
            content: HEALTH_CHECK_PROMPT,
          },
          {
            role: 'user',
            content: `Clean up these memories:\n${JSON.stringify(memoriesForLLM, null, 2)}`,
          },
        ],
        schema: healthCheckOutputSchema,
      })) as z.infer<typeof healthCheckOutputSchema>;

      for (const action of result.actions) {
        if (action.type === 'delete') {
          const mem = batch.find((m) => m.id === action.id);
          if (mem) {
            await memoryStore.deleteMemory(action.id);
            totalDeleted++;
            allDetails.push({ id: action.id, type: 'delete', reason: action.reason });
          }
        } else if (action.type === 'update') {
          const mem = batch.find((m) => m.id === action.id);
          if (mem && action.newContent) {
            await memoryStore.updateMemory(action.id, {
              content: action.newContent,
              category: action.newCategory,
            });
            totalUpdated++;
            allDetails.push({
              id: action.id,
              type: 'update',
              reason: action.reason,
            });
          }
        }
      }
    }

    const totalAfter = allMemories.length - totalDeleted;

    return NextResponse.json({
      success: true,
      totalBefore,
      totalAfter,
      deleted: totalDeleted,
      updated: totalUpdated,
      details: allDetails,
    });
  } catch (err) {
    console.error('[API] Memory health check failed:', err);
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 },
    );
  }
}
