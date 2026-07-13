import { ResearcherOutput, SearchAgentInput } from './types';
import SessionManager from '@/lib/session';
import { classify } from './classifier';
import Researcher from './researcher';
import { getWriterPrompt } from '@/lib/prompts/search/writer';
import { WidgetExecutor } from './widgets';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { TextBlock, ResearchBlock } from '@/lib/types';
import { getTokenCount } from '@/lib/utils/splitText';
import type { TokenUsage } from '@/lib/models/types';
import memoryStore from '@/lib/memory/store';
import { withRetryStream } from '@/lib/utils/withRetry';
import { createRetryStatusHandler } from '@/lib/utils/emitRetryStatus';
import UploadManager from '@/lib/uploads/manager';

class SearchAgent {
  private async syncBlocksToDb(
    chatId: string,
    messageId: string,
    session: SessionManager,
    phase: 'classifying' | 'researching' | 'writing',
  ) {
    try {
      await db
        .update(messages)
        .set({
          responseBlocks: session.getAllBlocks(),
          phase,
        })
        .where(
          and(
            eq(messages.chatId, chatId),
            eq(messages.messageId, messageId),
          ),
        )
        .execute();
    } catch (err) {
      console.error('Failed to sync blocks to db:', err);
    }
  }

  async searchAsync(session: SessionManager, input: SearchAgentInput) {
    const fileRecords = input.config.fileIds
      .map((id) => UploadManager.getFile(id))
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .map((f) => ({ fileId: f.id, name: f.name }));

    const exists = await db.query.messages.findFirst({
      where: and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    });

    if (!exists) {
      await db.insert(messages).values({
        chatId: input.chatId,
        messageId: input.messageId,
        backendId: session.id,
        query: input.originalQuery,
        createdAt: new Date().toISOString(),
        status: 'answering',
        responseBlocks: [],
        phase: 'classifying',
        files: fileRecords,
      });
    } else {
      await db
        .delete(messages)
        .where(
          and(eq(messages.chatId, input.chatId), gt(messages.id, exists.id)),
        )
        .execute();
      await db
        .update(messages)
        .set({
          status: 'answering',
          backendId: session.id,
          responseBlocks: [],
          phase: 'classifying',
          files: fileRecords,
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();
    }

    session.emit('data', { type: 'phase', phase: 'classifying' });

    const researchBlock: ResearchBlock = {
      id: crypto.randomUUID(),
      type: 'research',
      data: { subSteps: [] },
    };
    session.emitBlock(researchBlock);
    const retryHandler = createRetryStatusHandler(session, researchBlock.id);

    let classification;
    try {
      classification = await classify({
        chatHistory: input.chatHistory,
        enabledSources: input.config.sources,
        query: input.followUp,
        llm: input.config.llm,
        classificationLlm: input.config.classificationLlm,
        embedding: input.config.embedding,
        enableMemories: input.config.enableMemories,
        userProfile: input.config.userProfile,
        metadata: input.config.metadata,
        llmTimeout: input.config.llmTimeout,
        llmMaxRetries: input.config.llmMaxRetries,
      });
    } catch (err) {
      console.error('Classifier failed, using defaults:', err);
      classification = {
        classification: {
          skipSearch: true,
          personalSearch: false,
          academicSearch: false,
          discussionSearch: false,
          showWeatherWidget: false,
          showStockWidget: false,
          showCalculationWidget: false,
        },
        standaloneFollowUp: input.followUp,
      };
    }

    session.emit('data', { type: 'phase', phase: 'researching' });
    await this.syncBlocksToDb(
      input.chatId,
      input.messageId,
      session,
      'researching',
    );

    const widgetPromise = WidgetExecutor.executeAll({
      classification,
      chatHistory: input.chatHistory,
      followUp: input.followUp,
      llm: input.config.llm,
      userProfile: input.config.userProfile,
    }).then((widgetOutputs) => {
      widgetOutputs.forEach((o) => {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'widget',
          data: {
            widgetType: o.type,
            params: o.data,
          },
        });
      });
      return widgetOutputs;
    });

    let searchPromise: Promise<ResearcherOutput | null> | null = null;

    if (!classification.classification.skipSearch) {
      const researcher = new Researcher();
      searchPromise = researcher
        .research(session, {
          chatHistory: input.chatHistory,
          followUp: input.followUp,
          classification: classification,
          config: input.config,
          researchBlockId: researchBlock.id,
        })
        .catch((err) => {
          console.error('Researcher failed:', err);
          return null;
        });
    }

    const [widgetOutputs, searchResults] = await Promise.all([
      widgetPromise,
      searchPromise,
    ]);

    session.emit('data', {
      type: 'researchComplete',
    });

    session.emit('data', { type: 'phase', phase: 'writing' });
    await this.syncBlocksToDb(
      input.chatId,
      input.messageId,
      session,
      'writing',
    );

    const answerRetryHandler = createRetryStatusHandler(session, researchBlock.id);

    const searchAttempted = !classification.classification.skipSearch;

    let finalContext: string;
    if (searchResults?.searchFindings?.length) {
      finalContext = searchResults.searchFindings
        .map(
          (f, index) =>
            `<result index=${index + 1} title="${f.metadata.title}" url="${f.metadata.url}">${f.content}</result>`,
        )
        .join('\n');
    } else if (searchAttempted) {
      finalContext = '<Search performed but no relevant results found.>';
    } else {
      finalContext = '<No search performed — answer using your own knowledge.>';
    }

    const widgetContext = widgetOutputs
      .map((o) => {
        return `<result>${o.llmContext}</result>`;
      })
      .join('\n-------------\n');

    const finalContextWithWidgets = `<search_results note="These are the search results and assistant can cite these">\n${finalContext}\n</search_results>\n<widgets_result noteForAssistant="Its output is already showed to the user, assistant can use this information to answer the query but do not CITE this as a souce">\n${widgetContext}\n</widgets_result>`;

    let memoriesContext: string | undefined;

    if (input.config.enableMemories !== false) {
      try {
        memoryStore.setEmbeddingModel(input.config.embedding);
        const relevantMemories = await memoryStore.queryMemories(
          input.followUp,
          5,
          0.45,
        );
        if (relevantMemories.length > 0) {
          memoriesContext = relevantMemories
            .map((m) => `- ${m.content} (${m.category})`)
            .join('\n');
        }
      } catch (err) {
        console.error('Failed to query memories:', err);
      }
    }

    const userProfileContext = input.config.userProfile
      ? (() => {
          const parts: string[] = [];
          if (input.config.userProfile.name) parts.push(`Name: ${input.config.userProfile.name}`);
          if (input.config.userProfile.location) parts.push(`Location: ${input.config.userProfile.location}`);
          if (input.config.userProfile.aboutMe) parts.push(`About: ${input.config.userProfile.aboutMe}`);
          return parts.join('\n');
        })()
      : '';

    const now = input.config.metadata?.currentDate
      ? new Date(input.config.metadata.currentDate)
      : new Date();
    const timezone = input.config.metadata?.timezone || 'UTC';

    const writerPrompt = getWriterPrompt(
      finalContextWithWidgets,
      input.config.systemInstructions,
      input.config.mode,
      memoriesContext,
      userProfileContext,
      now,
      timezone,
      searchAttempted,
    );

    const answerStream = await withRetryStream(
      (signal) =>
        input.config.llm.streamText({
          messages: [
            {
              role: 'system',
              content: writerPrompt,
            },
            ...input.chatHistory,
            {
              role: 'user',
              content: input.followUp,
            },
          ],
        }),
      {
        timeout: input.config.llmTimeout || 60000,
        maxRetries: input.config.llmMaxRetries || 3,
        onStatus: answerRetryHandler,
      },
    );

    let responseBlockId = '';
    let chunkCount = 0;
    let finalUsage: TokenUsage | undefined;

    for await (const chunk of answerStream) {
      if (chunk.usage && chunk.done) {
        finalUsage = chunk.usage;
      }
      if (!responseBlockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: chunk.contentChunk,
        };

        session.emitBlock(block);

        responseBlockId = block.id;
      } else {
        const block = session.getBlock(responseBlockId) as TextBlock | null;

        if (!block) {
          continue;
        }

        block.data += chunk.contentChunk;

        session.updateBlock(block.id, [
          {
            op: 'replace',
            path: '/data',
            value: block.data,
          },
        ]);
      }

      chunkCount++;
      // Periodically sync blocks to DB during answer streaming
      if (chunkCount % 20 === 0) {
        await this.syncBlocksToDb(
          input.chatId,
          input.messageId,
          session,
          'writing',
        ).catch(() => {});
      }
    }

    // Persist final blocks before emitting end
    await db
      .update(messages)
      .set({
        status: 'completed',
        responseBlocks: session.getAllBlocks(),
        usage: finalUsage ?? null,
      })
      .where(
        and(
          eq(messages.chatId, input.chatId),
          eq(messages.messageId, input.messageId),
        ),
      )
      .execute();

    session.emit('end', {});
  }
}

export default SearchAgent;
