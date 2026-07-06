import db from '@/lib/db';
import { memories, messages } from '@/lib/db/schema';
import { and, eq, like, desc, sql, notInArray } from 'drizzle-orm';
import BaseEmbedding from '@/lib/models/base/embedding';
import computeSimilarity from '@/lib/utils/computeSimilarity';
import { Memory, MemoryCategory, MemoryInput } from './types';

class MemoryStore {
  private embeddingModel: BaseEmbedding<any> | null = null;

  setEmbeddingModel(model: BaseEmbedding<any>) {
    this.embeddingModel = model;
  }

  async addMemory(input: MemoryInput): Promise<Memory> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let embedding: string | null = null;
    if (this.embeddingModel) {
      try {
        const [emb] = await this.embeddingModel.embedText([input.content]);
        embedding = JSON.stringify(emb);
      } catch {
        // Silently skip embedding generation
      }
    }

    await db.insert(memories).values({
      id,
      content: input.content,
      category: input.category,
      embedding,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceChatId: input.sourceChatId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      content: input.content,
      category: input.category,
      embedding,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceChatId: input.sourceChatId ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getMemory(id: string): Promise<Memory | null> {
    const result = await db.query.memories.findFirst({
      where: eq(memories.id, id),
    });
    return result ?? null;
  }

  async listMemories(search?: string): Promise<Memory[]> {
    if (search && search.trim()) {
      return db
        .select()
        .from(memories)
        .where(like(memories.content, `%${search.trim()}%`))
        .orderBy(desc(memories.updatedAt))
        .all();
    }
    return db
      .select()
      .from(memories)
      .orderBy(desc(memories.updatedAt))
      .all();
  }

  async updateMemory(
    id: string,
    updates: { content?: string; category?: MemoryCategory },
  ): Promise<Memory | null> {
    const existing = await this.getMemory(id);
    if (!existing) return null;

    const newContent = updates.content ?? existing.content;
    const newCategory = updates.category ?? existing.category;

    let embedding = existing.embedding;
    if (updates.content && this.embeddingModel) {
      try {
        const [emb] = await this.embeddingModel.embedText([newContent]);
        embedding = JSON.stringify(emb);
      } catch {
        // keep old embedding
      }
    }

    const now = new Date().toISOString();
    await db
      .update(memories)
      .set({
        content: newContent,
        category: newCategory,
        embedding,
        updatedAt: now,
      })
      .where(eq(memories.id, id))
      .execute();

    return this.getMemory(id);
  }

  async deleteMemory(id: string): Promise<void> {
    await db.delete(memories).where(eq(memories.id, id)).execute();
  }

  async countMemories(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memories)
      .get();
    return result?.count ?? 0;
  }

  async queryMemories(
    query: string,
    topK: number = 5,
    threshold: number = 0.45,
  ): Promise<Memory[]> {
    if (!this.embeddingModel) return [];

    const allMemories = await db
      .select()
      .from(memories)
      .where(sql`embedding IS NOT NULL`)
      .all();

    if (allMemories.length === 0) return [];

    const [queryEmbedding] = await this.embeddingModel.embedText([query]);

    const scored: { memory: Memory; score: number }[] = [];

    for (const m of allMemories) {
      if (!m.embedding) continue;
      try {
        const memEmbedding = JSON.parse(m.embedding);
        const score = computeSimilarity(queryEmbedding, memEmbedding);
        if (score > threshold) {
          scored.push({ memory: m, score });
        }
      } catch {
        // skip malformed embeddings
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.memory);
  }

  async getUnprocessedMessages(): Promise<
    { messageId: string; chatId: string; query: string; createdAt: string }[]
  > {
    const dbMemories = await db.select().from(memories).all();
    const processedMessageIds = dbMemories
      .map((m) => m.sourceMessageId)
      .filter((id): id is string => id !== null);

    const filters: any[] = [
      eq(messages.status, 'completed' as any),
      sql`${messages.query} IS NOT NULL`,
      sql`${messages.query} != ''`,
    ];

    if (processedMessageIds.length > 0) {
      filters.push(notInArray(messages.messageId, processedMessageIds));
    }

    const result = await db
      .select({
        messageId: messages.messageId,
        chatId: messages.chatId,
        query: messages.query,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(...filters))
      .orderBy(messages.createdAt)
      .all();

    return result;
  }
}

const memoryStore = new MemoryStore();
export default memoryStore;
export { MemoryStore };
