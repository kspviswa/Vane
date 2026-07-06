export type MemoryCategory = 'personal_info' | 'preference' | 'fact' | 'project' | 'other';

export type Memory = {
  id: string;
  content: string;
  category: MemoryCategory;
  embedding: string | null;
  sourceMessageId: string | null;
  sourceChatId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryInput = {
  content: string;
  category: MemoryCategory;
  sourceMessageId?: string;
  sourceChatId?: string;
};
