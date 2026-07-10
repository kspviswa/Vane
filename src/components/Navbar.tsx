import { Clock, Edit, Share, FileText, FileDown, FolderKanban, Check } from 'lucide-react';
import { useEffect, useState, Fragment, useRef } from 'react';
import { formatTimeDifference } from '@/lib/utils';
import DeleteChat from './DeleteChat';
import ContextIndicator from './ContextIndicator';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useChat, Section } from '@/lib/hooks/useChat';
import { SourceBlock } from '@/lib/types';

interface Project {
  id: string;
  name: string;
}

const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
};

const exportAsMarkdown = (sections: Section[], title: string) => {
  const date = new Date(
    sections[0].message.createdAt || Date.now(),
  ).toLocaleString();
  let md = `# 💬 Chat Export: ${title}\n\n`;
  md += `*Exported on: ${date}*\n\n---\n`;

  sections.forEach((section, idx) => {
    md += `\n---\n`;
    md += `**🧑 User**  
`;
    md += `*${new Date(section.message.createdAt).toLocaleString()}*\n\n`;
    md += `> ${section.message.query.replace(/\n/g, '\n> ')}\n`;

    if (section.message.responseBlocks.length > 0) {
      md += `\n---\n`;
      md += `**🤖 Assistant**  
`;
      md += `*${new Date(section.message.createdAt).toLocaleString()}*\n\n`;
      md += `> ${section.message.responseBlocks
        .filter((b) => b.type === 'text')
        .map((block) => block.data)
        .join('\n')
        .replace(/\n/g, '\n> ')}\n`;
    }

    const sourceResponseBlock = section.message.responseBlocks.find(
      (block) => block.type === 'source',
    ) as SourceBlock | undefined;

    if (
      sourceResponseBlock &&
      sourceResponseBlock.data &&
      sourceResponseBlock.data.length > 0
    ) {
      md += `\n**Citations:**\n`;
      sourceResponseBlock.data.forEach((src: any, i: number) => {
        const url = src.metadata?.url || '';
        md += `- [${i + 1}] [${url}](${url})\n`;
      });
    }
  });
  md += '\n---\n';
  downloadFile(`${title || 'chat'}.md`, md, 'text/markdown');
};

const exportAsPDF = async (sections: Section[], title: string) => {
  const chatEl = document.getElementById('uttaram-chat');
  if (!chatEl) return;

  const clone = chatEl.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.width = '800px';
  clone.style.background = '#ffffff';
  clone.style.padding = '40px';
  clone.style.paddingBottom = '40px';
  clone.style.margin = '0';
  clone.style.maxWidth = 'none';

  // Remove interactive and non-content elements
  const removals = clone.querySelectorAll(
    'button, input, textarea, select, iframe, video, audio, [role="button"]',
  );
  removals.forEach((el) => el.remove());

  // Remove the gradient overlay and message input area at the bottom
  const fixedElements = clone.querySelectorAll('.fixed, .sticky');
  fixedElements.forEach((el) => el.remove());

  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      width: 800,
    });
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const doc = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    doc.save(`${title || 'chat'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
};

interface MoveToProjectDropdownProps {
  chatId: string;
  currentProjectId?: string | null;
  onMoved: () => void;
}

const MoveToProjectDropdown = ({ chatId, currentProjectId, onMoved }: MoveToProjectDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [moved, setMoved] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && projects.length === 0) {
      fetch('/api/projects')
        .then((res) => res.json())
        .then((data) => setProjects(data.projects ?? []))
        .catch(() => {});
    }
  }, [open, projects.length]);

  const handleMove = async (projectId: string | null) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('Failed to move chat');
      setOpen(false);
      setMoved(true);
      setTimeout(() => setMoved(false), 2000);
      onMoved();
    } catch {
      setOpen(false);
    }
  };

  if (moved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-500 px-2 py-1">
        <Check size={12} />
        Moved
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPosition({ top: rect.bottom + 4, left: Math.max(4, rect.left - 80) });
          }
          setOpen(!open);
        }}
        className="inline-flex items-center gap-1 text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors px-1.5 py-1 rounded hover:bg-light-200 dark:hover:bg-dark-200"
        title="Move to project"
      >
        <FolderKanban size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary shadow-lg py-1"
            style={{ top: position.top, left: position.left }}
          >
            <button
              onClick={() => handleMove(null)}
              className="w-full text-left px-3 py-1.5 text-sm text-black/70 dark:text-white/70 hover:bg-light-200 dark:hover:bg-dark-200 transition-colors"
            >
              No project
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleMove(p.id)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-light-200 dark:hover:bg-dark-200 ${
                  p.id === currentProjectId
                    ? 'text-[#24A0ED]'
                    : 'text-black/70 dark:text-white/70'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const TimerDisplay = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-emerald-500 dark:text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      {mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`}
    </span>
  );
};

const Navbar = () => {
  const [title, setTitle] = useState<string>('');
  const [timeAgo, setTimeAgo] = useState<string>('');
  const [projectName, setProjectName] = useState<string | null>(null);

  const { sections, chatId, loading, processingStartTime } = useChat();

  useEffect(() => {
    if (sections.length > 0 && sections[0].message) {
      const newTitle =
        sections[0].message.query.length > 30
          ? `${sections[0].message.query.substring(0, 30).trim()}...`
          : sections[0].message.query || 'New Conversation';

      setTitle(newTitle);
      const newTimeAgo = formatTimeDifference(
        new Date(),
        sections[0].message.createdAt,
      );
      setTimeAgo(newTimeAgo);
    }
  }, [sections]);

  useEffect(() => {
    if (!loading || sections.length === 0) return;
    const newTimeAgo = formatTimeDifference(
      new Date(),
      sections[0].message.createdAt,
    );
    setTimeAgo(newTimeAgo);
  }, [loading]);

  useEffect(() => {
    if (chatId) {
      fetch(`/api/chats/${chatId}`)
        .then((res) => res.json())
        .then((data) => {
          const pid = data.chat?.projectId;
          if (pid) {
            fetch('/api/projects')
              .then((res) => res.json())
              .then((pdata) => {
                const project = (pdata.projects ?? []).find((p: Project) => p.id === pid);
                if (project) setProjectName(project.name);
              })
              .catch(() => {});
          } else {
            setProjectName(null);
          }
        })
        .catch(() => {});
    }
  }, [chatId]);

  return (
    <div className="sticky -mx-4 lg:mx-0 top-0 z-40 bg-light-primary/95 dark:bg-dark-primary/95 backdrop-blur-sm border-b border-light-200/50 dark:border-dark-200/30 safe-top">
      <div className="px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <a
              href="/"
              className="lg:hidden mr-3 p-2 -ml-2 rounded-lg hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors duration-200"
            >
              <Edit size={18} className="text-black/70 dark:text-white/70" />
            </a>
            <div className="hidden lg:flex items-center gap-2 text-black/50 dark:text-white/50 min-w-0">
              <Clock size={14} />
              <span className="text-xs whitespace-nowrap">{timeAgo} ago</span>
            </div>
          </div>

          <div className="flex-1 mx-4 min-w-0 flex flex-col items-center">
            {projectName && (
              <span className="text-[10px] text-[#24A0ED] font-medium leading-tight">
                {projectName}
              </span>
            )}
            <h1 className="text-center text-sm font-medium text-black/80 dark:text-white/90 truncate max-w-full">
              {title || 'New Conversation'}
            </h1>
            {loading && processingStartTime && (
              <div className="mt-0.5">
                <TimerDisplay startTime={processingStartTime} />
              </div>
            )}
            <ContextIndicator />
          </div>

          <div className="flex items-center gap-1 min-w-0">
            {chatId && (
              <MoveToProjectDropdown
                chatId={chatId}
                onMoved={() => {
                  fetch(`/api/chats/${chatId}`)
                    .then((res) => res.json())
                    .then((data) => {
                      const pid = data.chat?.projectId;
                      if (pid) {
                        fetch('/api/projects')
                          .then((res) => res.json())
                          .then((pdata) => {
                            const project = (pdata.projects ?? []).find((p: Project) => p.id === pid);
                            if (project) setProjectName(project.name);
                            else setProjectName(null);
                          })
                          .catch(() => setProjectName(null));
                      } else {
                        setProjectName(null);
                      }
                    })
                    .catch(() => {});
                }}
              />
            )}
            <Popover className="relative">
              <PopoverButton className="p-2 rounded-lg hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors duration-200">
                <Share size={16} className="text-black/60 dark:text-white/60" />
              </PopoverButton>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <PopoverPanel className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 shadow-xl shadow-black/10 dark:shadow-black/30 z-50">
                  <div className="p-3">
                    <div className="mb-2">
                      <p className="text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wide">
                        Export Chat
                      </p>
                    </div>
                    <div className="space-y-1">
                      <button
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors duration-200"
                        onClick={() => exportAsMarkdown(sections, title || '')}
                      >
                        <FileText size={16} className="text-[#24A0ED]" />
                        <div>
                          <p className="text-sm font-medium text-black dark:text-white">
                            Markdown
                          </p>
                          <p className="text-xs text-black/50 dark:text-white/50">
                            .md format
                          </p>
                        </div>
                      </button>
                      <button
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors duration-200"
                        onClick={() => exportAsPDF(sections, title || '')}
                      >
                        <FileDown size={16} className="text-[#24A0ED]" />
                        <div>
                          <p className="text-sm font-medium text-black dark:text-white">
                            PDF
                          </p>
                          <p className="text-xs text-black/50 dark:text-white/50">
                            Document format
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </Popover>
            <DeleteChat
              redirect
              chatId={chatId!}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
