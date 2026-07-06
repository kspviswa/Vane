--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    embedding TEXT,
    sourceMessageId TEXT,
    sourceChatId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);
