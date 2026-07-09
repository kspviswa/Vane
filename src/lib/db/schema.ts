import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { Block } from '../types';
import { SearchSources } from '../agents/search/types';
import type { TokenUsage } from '../models/types';

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey(),
  messageId: text('messageId').notNull(),
  chatId: text('chatId').notNull(),
  backendId: text('backendId').notNull(),
  query: text('query').notNull(),
  createdAt: text('createdAt').notNull(),
  responseBlocks: text('responseBlocks', { mode: 'json' })
    .$type<Block[]>()
    .default(sql`'[]'`),
  status: text({ enum: ['answering', 'completed', 'error'] }).default(
    'answering',
  ),
  phase: text({ enum: ['classifying', 'researching', 'writing'] }).default(
    'classifying',
  ),
  usage: text('usage', { mode: 'json' }).$type<TokenUsage | null>().default(sql`NULL`),
  extractedAt: text('extractedAt'),
});

interface DBFile {
  name: string;
  fileId: string;
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category', {
    enum: ['personal_info', 'preference', 'fact', 'project', 'other'],
  })
    .notNull()
    .default('other'),
  embedding: text('embedding'),
  sourceMessageId: text('sourceMessageId'),
  sourceChatId: text('sourceChatId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>().notNull().default({}),
  updatedAt: text('updatedAt').notNull(),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('createdAt').notNull(),
  sources: text('sources', {
    mode: 'json',
  })
    .$type<SearchSources[]>()
    .default(sql`'[]'`),
  files: text('files', { mode: 'json' })
    .$type<DBFile[]>()
    .default(sql`'[]'`),
  projectId: text('projectId'),
  parentId: text('parentId'),
});
