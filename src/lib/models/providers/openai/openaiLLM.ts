import OpenAI from 'openai';
import BaseLLM from '../../base/llm';
import { zodTextFormat, zodResponseFormat } from 'openai/helpers/zod';
import {
  GenerateObjectInput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
  ToolCall,
  TokenUsage,
} from '../../types';
import { parse } from 'partial-json';
import z from 'zod';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/index.mjs';
import { ContentPart, Message } from '@/lib/types';
import { repairJson } from '@toolsycc/json-repair';

type OpenAIConfig = {
  apiKey: string;
  model: string;
  baseURL?: string;
  options?: GenerateOptions;
};

class OpenAILLM extends BaseLLM<OpenAIConfig> {
  openAIClient: OpenAI;

  constructor(protected config: OpenAIConfig) {
    super(config);

    this.openAIClient = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://api.openai.com/v1',
    });
  }

  convertToOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.id,
          content: msg.content,
        } as ChatCompletionToolMessageParam;
      } else if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content,
          ...(msg.tool_calls &&
            msg.tool_calls.length > 0 && {
              tool_calls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
        } as ChatCompletionAssistantMessageParam;
      }

      if (msg.role === 'user' && msg.images && msg.images.length > 0) {
        const parts: ContentPart[] = [
          { type: 'text', text: msg.content },
          ...msg.images.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ];
        return { role: 'user', content: parts } as ChatCompletionMessageParam;
      }

      return msg;
    });
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const response = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      messages: this.convertToOpenAIMessages(input.messages),
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: input.options?.topP ?? this.config.options?.topP,
      max_completion_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens,
      stop: input.options?.stopSequences ?? this.config.options?.stopSequences,
      frequency_penalty:
        input.options?.frequencyPenalty ??
        this.config.options?.frequencyPenalty,
      presence_penalty:
        input.options?.presencePenalty ?? this.config.options?.presencePenalty,
    });

    if (response.choices && response.choices.length > 0) {
      const usage: TokenUsage | undefined = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      return {
        content: response.choices[0].message.content!,
        toolCalls:
          response.choices[0].message.tool_calls
            ?.map((tc) => {
              if (tc.type === 'function') {
                return {
                  name: tc.function.name,
                  id: tc.id,
                  arguments: JSON.parse(tc.function.arguments),
                };
              }
            })
            .filter((tc) => tc !== undefined) || [],
        additionalInfo: {
          finishReason: response.choices[0].finish_reason,
        },
        usage,
      };
    }

    throw new Error('No response from OpenAI');
  }

  async *streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const stream = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      messages: this.convertToOpenAIMessages(input.messages),
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: input.options?.topP ?? this.config.options?.topP,
      max_completion_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens,
      stop: input.options?.stopSequences ?? this.config.options?.stopSequences,
      frequency_penalty:
        input.options?.frequencyPenalty ??
        this.config.options?.frequencyPenalty,
      presence_penalty:
        input.options?.presencePenalty ?? this.config.options?.presencePenalty,
      stream: true,
      stream_options: { include_usage: true },
    });

    let recievedToolCalls: { name: string; id: string; arguments: string }[] =
      [];

    for await (const chunk of stream) {
      const usage: TokenUsage | undefined =
        chunk.usage
          ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          : undefined;

      if (chunk.choices && chunk.choices.length > 0) {
        const toolCalls = chunk.choices[0].delta.tool_calls;
        yield {
          contentChunk: chunk.choices[0].delta.content || '',
          toolCallChunk:
            toolCalls?.map((tc) => {
              if (!recievedToolCalls[tc.index]) {
                const call = {
                  name: tc.function?.name!,
                  id: tc.id!,
                  arguments: tc.function?.arguments || '',
                };
                recievedToolCalls.push(call);
                return { ...call, arguments: parse(call.arguments || '{}') };
              } else {
                const existingCall = recievedToolCalls[tc.index];
                existingCall.arguments += tc.function?.arguments || '';
                return {
                  ...existingCall,
                  arguments: parse(existingCall.arguments),
                };
              }
            }) || [],
          done: chunk.choices[0].finish_reason !== null,
          additionalInfo: {
            finishReason: chunk.choices[0].finish_reason,
          },
          usage,
        };
      } else if (usage) {
        yield {
          contentChunk: '',
          toolCallChunk: [],
          done: true,
          usage,
        };
      }
    }
  }
  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    let rawContent = '';

    const tryWithFormat = async (): Promise<string> => {
      const response = await this.openAIClient.chat.completions.create({
        messages: this.convertToOpenAIMessages(input.messages),
        model: this.config.model,
        temperature:
          input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
        top_p: input.options?.topP ?? this.config.options?.topP,
        max_completion_tokens:
          input.options?.maxTokens ?? this.config.options?.maxTokens,
        stop: input.options?.stopSequences ?? this.config.options?.stopSequences,
        frequency_penalty:
          input.options?.frequencyPenalty ??
          this.config.options?.frequencyPenalty,
        presence_penalty:
          input.options?.presencePenalty ??
          this.config.options?.presencePenalty,
        response_format: zodResponseFormat(input.schema, 'object'),
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from OpenAI');
      }

      return response.choices[0].message.content || '';
    };

    try {
      rawContent = await tryWithFormat();
    } catch (err) {
      throw new Error(`Error generating object from OpenAI: ${err}`);
    }

    if (!rawContent.trim()) {
      console.warn(`[OpenAI generateObject] Empty response with structured output format, retrying without format (model: ${this.config.model})`);
      try {
        const messages = this.convertToOpenAIMessages(input.messages);
        const schemaDescription = JSON.stringify(z.toJSONSchema ? z.toJSONSchema(input.schema) : input.schema, null, 2);
        const jsonInstruction = {
          role: 'system' as const,
          content: `You must respond with valid JSON matching this schema:\n${schemaDescription}\n\nDo not wrap in markdown code blocks. Output ONLY the JSON object.`,
        };
        messages.unshift(jsonInstruction);

        const response = await this.openAIClient.chat.completions.create({
          messages,
          model: this.config.model,
          temperature:
            input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
          top_p: input.options?.topP ?? this.config.options?.topP,
          max_completion_tokens:
            input.options?.maxTokens ?? this.config.options?.maxTokens,
          stop: input.options?.stopSequences ?? this.config.options?.stopSequences,
          frequency_penalty:
            input.options?.frequencyPenalty ??
            this.config.options?.frequencyPenalty,
          presence_penalty:
            input.options?.presencePenalty ??
            this.config.options?.presencePenalty,
        });

        if (response.choices && response.choices.length > 0) {
          rawContent = response.choices[0].message.content || '';
        }
      } catch (fallbackErr) {
        console.error(`[OpenAI generateObject] Fallback also failed: ${fallbackErr}`);
      }
    }

    if (!rawContent.trim()) {
      console.warn(`[OpenAI generateObject] Empty response from model ${this.config.model}`);
      return input.schema.parse({}) as T;
    }

    const tryParse = (text: string): T | null => {
      try {
        return input.schema.parse(JSON.parse(text)) as T;
      } catch {
        return null;
      }
    };

    let parsed: T | null = tryParse(rawContent);
    if (parsed) return parsed;

    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      parsed = tryParse(codeBlockMatch[1].trim());
      if (parsed) return parsed;
    }

    const repaired = repairJson(rawContent, { extractJson: true }) as string;
    parsed = tryParse(repaired);
    if (parsed) return parsed;

    try {
      const partial = parse(rawContent);
      parsed = tryParse(JSON.stringify(partial));
      if (parsed) return parsed;
    } catch {
      // fall through
    }

    console.warn(`[OpenAI generateObject] Failed to parse JSON from model ${this.config.model}, raw: ${rawContent.slice(0, 500)}`);
    return input.schema.parse({}) as T;
  }

  async *streamObject<T>(input: GenerateObjectInput): AsyncGenerator<T> {
    let recievedObj: string = '';

    const stream = this.openAIClient.responses.stream({
      model: this.config.model,
      input: input.messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: input.options?.topP ?? this.config.options?.topP,
      max_completion_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens,
      stop: input.options?.stopSequences ?? this.config.options?.stopSequences,
      frequency_penalty:
        input.options?.frequencyPenalty ??
        this.config.options?.frequencyPenalty,
      presence_penalty:
        input.options?.presencePenalty ?? this.config.options?.presencePenalty,
      text: {
        format: zodTextFormat(input.schema, 'object'),
      },
    });

    for await (const chunk of stream) {
      if (chunk.type === 'response.output_text.delta' && chunk.delta) {
        recievedObj += chunk.delta;

        try {
          yield parse(recievedObj) as T;
        } catch (err) {
          console.log('Error parsing partial object from OpenAI:', err);
          yield {} as T;
        }
      } else if (chunk.type === 'response.output_text.done' && chunk.text) {
        try {
          yield parse(chunk.text) as T;
        } catch (err) {
          throw new Error(`Error parsing response from OpenAI: ${err}`);
        }
      }
    }
  }
}

export default OpenAILLM;
