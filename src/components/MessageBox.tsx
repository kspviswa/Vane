'use client';

/* eslint-disable @next/next/no-img-element */
import React, { MutableRefObject, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BookCopy,
  Disc3,
  Volume2,
  StopCircle,
  Layers3,
  Plus,
  CornerDownRight,
  Copy as CopyIcon,
  Check,
} from 'lucide-react';
import Markdown, { MarkdownToJSX, RuleType } from 'markdown-to-jsx';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import Copy from './MessageActions/Copy';
import Rewrite from './MessageActions/Rewrite';
import Summarize from './MessageActions/Summarize';
import Fork from './MessageActions/Fork';
import MessageSources from './MessageSources';
import SearchImages from './SearchImages';
import SearchVideos from './SearchVideos';
import { useSpeech } from 'react-text-to-speech';
import ThinkBox from './ThinkBox';
import { useChat, Section } from '@/lib/hooks/useChat';
import Citation from './MessageRenderer/Citation';
import AssistantSteps from './AssistantSteps';
import { ResearchBlock } from '@/lib/types';
import Renderer from './Widgets/Renderer';
import CodeBlock from './MessageRenderer/CodeBlock';

const renderMath = (text: string): string => {
  const blocks: string[] = [];
  const extracted = text.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
    (match) => {
      blocks.push(match);
      return `%%MATH_${blocks.length - 1}%%`;
    },
  );
  return extracted.replace(/%%MATH_(\d+)%%/g, (_, idx) => {
    const raw = blocks[parseInt(idx)];
    if (!raw) return '';
    const isDisplay = raw.startsWith('$$') || raw.startsWith('\\[');
    const content = raw
      .replace(/^\$\$/, '')
      .replace(/\$\$$/, '')
      .replace(/^\\\[/, '')
      .replace(/\\\]$/, '')
      .replace(/^\\\(/, '')
      .replace(/\\\)$/, '')
      .trim();
    try {
      return katex.renderToString(content, {
        displayMode: isDisplay,
        throwOnError: false,
      });
    } catch {
      return raw;
    }
  });
};

const ThinkTagProcessor = ({
  children,
  thinkingEnded,
}: {
  children: React.ReactNode;
  thinkingEnded: boolean;
}) => {
  return (
    <ThinkBox content={children as string} thinkingEnded={thinkingEnded} />
  );
};

const MessageBox = ({
  section,
  sectionIndex,
  dividerRef,
  isLast,
}: {
  section: Section;
  sectionIndex: number;
  dividerRef?: MutableRefObject<HTMLDivElement | null>;
  isLast: boolean;
}) => {
  const {
    loading,
    sendMessage,
    rewrite,
    messages,
    researchEnded,
    chatHistory,
  } = useChat();

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
  const uploadsBase = '/api/uploads';
  const messageFiles = (section.message.files || []).map((f) => ({
    fileName: f.name,
    fileExtension: f.name.split('.').pop() || '',
    fileId: f.fileId,
  }));

  const parsedMessage = renderMath(section.parsedTextBlocks.join('\n\n'));
  const speechMessage = section.speechMessage || '';
  const thinkingEnded = section.thinkingEnded;

  const sourceBlocks = section.message.responseBlocks.filter(
    (block): block is typeof block & { type: 'source' } =>
      block.type === 'source',
  );

  const sources = sourceBlocks.flatMap((block) => block.data);

  const hasContent = section.parsedTextBlocks.length > 0;

  const { speechStatus, start, stop } = useSpeech({ text: speechMessage });

  const markdownOverrides: MarkdownToJSX.Options = {
    renderRule(next, node, renderChildren, state) {
      if (node.type === RuleType.codeInline) {
        return (
          <code
            key={state.key}
            className="px-1.5 py-0.5 rounded-md text-sm bg-light-200/70 dark:bg-dark-200/70 text-black dark:text-white font-mono"
          >
            {node.text}
          </code>
        );
      }

      if (node.type === RuleType.codeBlock) {
        return (
          <CodeBlock key={state.key} language={node.lang || ''}>
            {node.text}
          </CodeBlock>
        );
      }

      return next();
    },
    overrides: {
      think: {
        component: ThinkTagProcessor,
        props: {
          thinkingEnded: thinkingEnded,
        },
      },
      citation: {
        component: Citation,
      },
      code: {
        component: ({ children, className }: { children: React.ReactNode; className?: string }) => {
          const lang = className?.replace('lang-', '') || '';
          if (lang) {
            return <CodeBlock language={lang}>{children}</CodeBlock>;
          }
          return (
            <code className="px-1.5 py-0.5 rounded-md text-sm bg-light-200/70 dark:bg-dark-200/70 text-black dark:text-white font-mono">
              {children}
            </code>
          );
        },
      },
    },
  };

  const [queryExpanded, setQueryExpanded] = useState(false);
  const [queryCopied, setQueryCopied] = useState(false);
  const query = section.message.query;
  const QUERY_CHAR_LIMIT = 200;
  const isLongQuery = query.length > QUERY_CHAR_LIMIT;
  const displayQuery = isLongQuery && !queryExpanded ? query.slice(0, QUERY_CHAR_LIMIT) + '...' : query;

  return (
    <div className="space-y-6">
      <div className={'w-full pt-8 break-words'}>
        <div className="flex items-start gap-2 lg:w-9/12">
          <h2 className="text-black dark:text-white font-medium text-3xl flex-1 min-w-0">
            {displayQuery}
          </h2>
          <div className="flex items-center gap-1 pt-1 flex-shrink-0">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(query);
                } catch {
                  const ta = document.createElement('textarea');
                  ta.value = query;
                  ta.style.position = 'fixed';
                  ta.style.opacity = '0';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                }
                setQueryCopied(true);
                setTimeout(() => setQueryCopied(false), 1500);
              }}
              className="p-1.5 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 rounded-lg hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
              title="Copy prompt"
            >
              {queryCopied ? <Check size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        </div>
        {isLongQuery && (
          <button
            onClick={() => setQueryExpanded(!queryExpanded)}
            className="mt-1 text-xs text-[#24A0ED] hover:underline"
          >
            {queryExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {messageFiles.length > 0 && (
        <div className="flex flex-wrap gap-3 lg:w-9/12">
          {messageFiles.map((f) => {
            const isImage = IMAGE_EXTS.has(f.fileExtension);
            const src = `${uploadsBase}/${f.fileId}`;
            return (
              <a
                key={f.fileId}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-xl border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary hover:border-[#24A0ED]/50 dark:hover:border-[#24A0ED]/50 transition-all duration-200"
                title={f.fileName}
              >
                {isImage ? (
                  <div className="relative">
                    <img
                      src={src}
                      alt={f.fileName}
                      className="w-24 h-24 object-cover rounded-xl"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 rounded-xl" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-24 h-24 gap-1 p-2">
                    <svg className="w-8 h-8 text-black/50 dark:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[10px] text-black/50 dark:text-white/50 truncate max-w-full text-center leading-tight">
                      {f.fileName}
                    </span>
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}

      <div className="flex flex-col space-y-9 lg:space-y-0 lg:flex-row lg:justify-between lg:space-x-9">
        <div
          ref={dividerRef}
          className="flex flex-col space-y-6 w-full lg:w-9/12"
        >
          {sources.length > 0 && (
            <div className="flex flex-col space-y-2">
              <div className="flex flex-row items-center space-x-2">
                <BookCopy className="text-black dark:text-white" size={20} />
                <h3 className="text-black dark:text-white font-medium text-xl">
                  Sources
                </h3>
              </div>
              <MessageSources sources={sources} />
            </div>
          )}

          {section.message.responseBlocks
            .filter(
              (block): block is ResearchBlock =>
                block.type === 'research' && block.data.subSteps.length > 0,
            )
            .map((researchBlock) => (
              <div key={researchBlock.id} className="flex flex-col space-y-2">
                <AssistantSteps
                  block={researchBlock}
                  status={section.message.status}
                  isLast={isLast}
                />
              </div>
            ))}

          {isLast &&
            loading &&
            !researchEnded &&
            !section.message.responseBlocks.some(
              (b) => b.type === 'research' && b.data.subSteps.length > 0,
            ) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200">
                <Disc3 className="w-4 h-4 text-black dark:text-white animate-spin" />
                <span className="text-sm text-black/70 dark:text-white/70">
                  {section.message.phase === 'classifying'
                    ? 'Classifying query...'
                    : 'Brainstorming...'}
                </span>
              </div>
            )}

          {isLast && loading && researchEnded && !hasContent && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200">
              <Disc3 className="w-4 h-4 text-black dark:text-white animate-spin" />
              <span className="text-sm text-black/70 dark:text-white/70">
                Generating answer...
              </span>
            </div>
          )}

          {section.widgets.length > 0 && <Renderer widgets={section.widgets} />}

          <div className="flex flex-col space-y-2">
            {sources.length > 0 && (
              <div className="flex flex-row items-center space-x-2">
                <Disc3
                  className={cn(
                    'text-black dark:text-white',
                    isLast && loading ? 'animate-spin' : 'animate-none',
                  )}
                  size={20}
                />
                <h3 className="text-black dark:text-white font-medium text-xl">
                  Answer
                </h3>
              </div>
            )}

            {hasContent && (
              <>
                <Markdown
                  className={cn(
                    'prose prose-h1:mb-3 prose-h2:mb-2 prose-h2:mt-6 prose-h2:font-[800] prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:font-[600] dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 font-[400]',
                    'max-w-none break-words text-black dark:text-white',
                  )}
                  options={markdownOverrides}
                >
                  {parsedMessage}
                </Markdown>

                {loading && isLast ? null : (
                  <div className="flex flex-row items-center justify-between w-full text-black dark:text-white py-4">
                    <div className="flex flex-row items-center -ml-2">
                      <Rewrite
                        rewrite={rewrite}
                        messageId={section.message.messageId}
                      />
                      <Summarize sectionIndex={sectionIndex} />
                      <Fork sectionIndex={sectionIndex} />
                    </div>
                    <div className="flex flex-row items-center -mr-2">
                      <Copy initialMessage={parsedMessage} section={section} />
                      <button
                        onClick={() => {
                          if (speechStatus === 'started') {
                            stop();
                          } else {
                            start();
                          }
                        }}
                        className="p-2 text-black/70 dark:text-white/70 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary transition duration-200 hover:text-black dark:hover:text-white"
                      >
                        {speechStatus === 'started' ? (
                          <StopCircle size={16} />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isLast &&
                  section.suggestions &&
                  section.suggestions.length > 0 &&
                  hasContent &&
                  !loading && (
                    <div className="mt-6">
                      <div className="flex flex-row items-center space-x-2 mb-4">
                        <Layers3
                          className="text-black dark:text-white"
                          size={20}
                        />
                        <h3 className="text-black dark:text-white font-medium text-xl">
                          Related
                        </h3>
                      </div>
                      <div className="space-y-0">
                        {section.suggestions.map(
                          (suggestion: string, i: number) => (
                            <div key={i}>
                              <div className="h-px bg-light-200/40 dark:bg-dark-200/40" />
                              <button
                                onClick={() => sendMessage(suggestion)}
                                className="group w-full py-4 text-left transition-colors duration-200"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex flex-row space-x-3 items-center">
                                    <CornerDownRight
                                      size={15}
                                      className="group-hover:text-sky-400 transition-colors duration-200 flex-shrink-0"
                                    />
                                    <p className="text-sm text-black/70 dark:text-white/70 group-hover:text-sky-400 transition-colors duration-200 leading-relaxed">
                                      {suggestion}
                                    </p>
                                  </div>
                                  <Plus
                                    size={16}
                                    className="text-black/40 dark:text-white/40 group-hover:text-sky-400 transition-colors duration-200 flex-shrink-0"
                                  />
                                </div>
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {hasContent && (
          <div className="lg:sticky lg:top-20 flex flex-col items-center space-y-3 w-full lg:w-3/12 z-30 h-full pb-4">
            <SearchImages
              query={section.message.query}
              chatHistory={chatHistory}
              messageId={section.message.messageId}
            />
            <SearchVideos
              chatHistory={chatHistory}
              query={section.message.query}
              messageId={section.message.messageId}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBox;
