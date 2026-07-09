'use client';

import { formatTimeDifference } from '@/lib/utils';
import {
  BrainCircuit,
  ClockIcon,
  Plus,
  X,
  Check,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Tag,
  Stethoscope,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

type MemoryCategory = 'personal_info' | 'preference' | 'fact' | 'project' | 'other';

interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  sourceMessageId: string | null;
  sourceChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  personal_info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  preference: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  fact: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  project: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  other: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal_info: 'Personal Info',
  preference: 'Preference',
  fact: 'Fact',
  project: 'Project',
  other: 'Other',
};

const AddMemoryForm = ({ onCreated }: { onCreated: () => void }) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('other');
  const [open, setOpen] = useState(false);

  const handleCreate = async () => {
    if (!content.trim()) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category }),
      });
      if (!res.ok) throw new Error('Failed to create memory');
      setContent('');
      setCategory('other');
      setOpen(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
      >
        <Plus size={16} />
        Add Memory
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="e.g., User lives in Paris, France"
        rows={2}
        className="w-full bg-transparent border border-light-200 dark:border-dark-200 rounded-lg px-3 py-2 text-sm text-black dark:text-white outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          className="bg-transparent border border-light-200 dark:border-dark-200 rounded-lg px-2 py-1.5 text-xs text-black/70 dark:text-white/70 outline-none"
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          className="p-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition-opacity"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const EditMemoryForm = ({
  memory,
  onSaved,
  onCancel,
}: {
  memory: Memory;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState(memory.category);

  const handleSave = async () => {
    if (!content.trim()) return;
    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category }),
      });
      if (!res.ok) throw new Error('Failed to update memory');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        className="w-full bg-transparent border border-light-200 dark:border-dark-200 rounded-lg px-3 py-2 text-sm text-black dark:text-white outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          className="bg-transparent border border-light-200 dark:border-dark-200 rounded-lg px-2 py-1.5 text-xs text-black/70 dark:text-white/70 outline-none"
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          className="p-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition-opacity"
        >
          <Check size={14} />
        </button>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const Page = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<{
    deleted: number;
    updated: number;
    totalBefore: number;
    totalAfter: number;
  } | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setHealthResult(null);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/memories${params}`);
      const data = await res.json();
      setMemories(data.memories);
      setCount(data.count);
    } catch (err) {
      console.error('Error fetching memories:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchMemories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const res = await fetch('/api/memories/extract', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(
          data.extracted > 0
            ? `Extracted ${data.extracted} new memories`
            : 'No new memories found',
        );
        fetchMemories();
      } else {
        toast.error('Extraction failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleHealthCheck = async () => {
    setHealthChecking(true);
    setHealthResult(null);
    try {
      const res = await fetch('/api/memories/health-check', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHealthResult(data);
        toast.success(
          data.deleted + data.updated > 0
            ? `Cleaned up: ${data.deleted} deleted, ${data.updated} updated`
            : 'Memories are already in good shape',
        );
        fetchMemories();
      } else {
        toast.error(data.error || 'Health check failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setHealthChecking(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col pt-10 border-b border-light-200/20 dark:border-dark-200/20 pb-6 px-2">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="flex items-center justify-center">
            <BrainCircuit size={45} className="mb-2.5" />
            <div className="flex flex-col">
              <h1
                className="text-5xl font-normal p-2 pb-0"
                style={{ fontFamily: 'PP Editorial, serif' }}
              >
                Memories
              </h1>
              <div className="px-2 text-sm text-black/60 dark:text-white/60 text-center lg:text-left">
                Personal facts and preferences extracted from your conversations.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end gap-2 text-xs text-black/60 dark:text-white/60">
            <span className="inline-flex items-center gap-1 rounded-full border border-black/20 dark:border-white/20 px-2 py-0.5">
              <BrainCircuit size={14} />
              {loading
                ? 'Loading\u2026'
                : `${count} ${count === 1 ? 'memory' : 'memories'}`}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 px-2 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <AddMemoryForm onCreated={fetchMemories} />
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
              className="w-full bg-transparent border border-light-200 dark:border-dark-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-black dark:text-white outline-none focus:border-black/30 dark:focus:border-white/30"
            />
          </div>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={extracting ? 'animate-spin' : ''}
            />
            {extracting ? 'Extracting...' : 'Extract Now'}
          </button>
          <button
            onClick={handleHealthCheck}
            disabled={healthChecking}
            className="inline-flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors disabled:opacity-50"
          >
            <Stethoscope
              size={14}
              className={healthChecking ? 'animate-pulse' : ''}
            />
            {healthChecking ? 'Checking...' : 'Health Check'}
          </button>
        </div>
      </div>

      {healthResult && (
        <div className="mx-2 mt-4 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-sm text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-medium mb-1">
            <Stethoscope size={14} />
            Memory Health Check Complete
          </div>
          <p>
            {healthResult.totalBefore} memories → {healthResult.totalAfter}{' '}
            memories.
            {healthResult.deleted > 0 && (
              <span> {healthResult.deleted} deleted.</span>
            )}
            {healthResult.updated > 0 && (
              <span> {healthResult.updated} updated.</span>
            )}
            {healthResult.deleted === 0 && healthResult.updated === 0 && (
              <span> No changes needed.</span>
            )}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-row items-center justify-center min-h-[60vh]">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-light-200 fill-light-secondary dark:text-[#202020] animate-spin dark:fill-[#ffffff3b]"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100.003 78.2051 78.1951 100.003 50.5908 100C22.9765 99.9972 0.997224 78.018 1 50.4037C1.00281 22.7993 22.8108 0.997224 50.4251 1C78.0395 1.00281 100.018 22.8108 100 50.4251ZM9.08164 50.594C9.06312 73.3997 27.7909 92.1272 50.5966 92.1457C73.4023 92.1642 92.1298 73.4365 92.1483 50.6308C92.1669 27.8251 73.4392 9.0973 50.6335 9.07878C27.8278 9.06026 9.10003 27.787 9.08164 50.594Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4037 97.8624 35.9116 96.9801 33.5533C95.1945 28.8227 92.871 24.3692 90.0681 20.348C85.6237 14.1775 79.4473 9.36872 72.0454 6.45794C64.6435 3.54717 56.3134 2.65431 48.3133 3.89319C45.869 4.27179 44.3768 6.77534 45.014 9.20079C45.6512 11.6262 48.1343 13.0956 50.5786 12.717C56.5073 11.8281 62.5542 12.5399 68.0406 14.7911C73.527 17.0422 78.2187 20.7487 81.5841 25.4923C83.7976 28.5886 85.4467 32.059 86.4416 35.7474C87.1273 38.1189 89.5423 39.6781 91.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
            <BrainCircuit className="text-black/70 dark:text-white/70" />
          </div>
          <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
            No memories found.
          </p>
          <p className="mt-1 text-black/70 dark:text-white/70 text-sm">
            Memories are extracted automatically after each conversation turn,
            or you can add one manually above.
          </p>
        </div>
      ) : (
        <div className="pt-6 pb-28 px-2 space-y-3">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="rounded-2xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary overflow-hidden"
            >
              <div className="p-4">
                {editingId === memory.id ? (
                  <EditMemoryForm
                    memory={memory}
                    onSaved={() => {
                      setEditingId(null);
                      fetchMemories();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <p className="text-sm text-black dark:text-white leading-relaxed">
                      {memory.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${CATEGORY_COLORS[memory.category] || CATEGORY_COLORS.other}`}
                      >
                        <Tag size={10} />
                        {CATEGORY_LABELS[memory.category]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-black/50 dark:text-white/50">
                        <ClockIcon size={12} />
                        {formatTimeDifference(
                          new Date(),
                          memory.createdAt,
                        )}{' '}
                        Ago
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => setEditingId(memory.id)}
                          className="p-1 rounded-lg hover:bg-light-200 dark:hover:bg-dark-200 text-black/50 dark:text-white/50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(memory.id)}
                          className="p-1 rounded-lg hover:bg-light-200 dark:hover:bg-dark-200 text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Page;
