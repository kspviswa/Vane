import z from 'zod';
import { ClassifierInput } from './types';
import { classifierPrompt } from '@/lib/prompts/search/classifier';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';
import memoryStore from '@/lib/memory/store';

const schema = z.object({
  classification: z.object({
    skipSearch: z
      .boolean()
      .describe('Indicates whether to skip the search step.'),
    personalSearch: z
      .boolean()
      .describe('Indicates whether to perform a personal search.'),
    academicSearch: z
      .boolean()
      .describe('Indicates whether to perform an academic search.'),
    discussionSearch: z
      .boolean()
      .describe('Indicates whether to perform a discussion search.'),
    showWeatherWidget: z
      .boolean()
      .describe('Indicates whether to show the weather widget.'),
    showStockWidget: z
      .boolean()
      .describe('Indicates whether to show the stock widget.'),
    showCalculationWidget: z
      .boolean()
      .describe('Indicates whether to show the calculation widget.'),
  }),
  standaloneFollowUp: z
    .string()
    .describe(
      "A self-contained, context-independent reformulation of the user's question.",
    ),
});

export const classify = async (input: ClassifierInput) => {
  let memoriesContext = '';
  if (input.enableMemories !== false) {
    try {
      if (input.embedding) {
        memoryStore.setEmbeddingModel(input.embedding);
        const relevantMemories = await memoryStore.queryMemories(
          input.query,
          3,
          0.45,
        );
        if (relevantMemories.length > 0) {
          memoriesContext = relevantMemories
            .map((m) => `- ${m.content}`)
            .join('\n');
        }
      }
    } catch {
      // silently ignore memory errors in classifier
    }
  }

  const userContent = `<conversation_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_query>\n${input.query}\n</user_query>${memoriesContext ? `\n<user_memories>\n${memoriesContext}\n</user_memories>` : ''}`;

  const output = await input.llm.generateObject<typeof schema>({
    messages: [
      {
        role: 'system',
        content: classifierPrompt,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    schema,
  });

  return output;
};
