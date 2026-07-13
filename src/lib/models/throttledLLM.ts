import z from 'zod';
import BaseLLM from './base/llm';
import { globalLlmSemaphore } from './throttle';
import {
  GenerateObjectInput,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
} from './types';

class ThrottledLLM extends BaseLLM<any> {
  private inner: BaseLLM<any>;

  constructor(inner: BaseLLM<any>) {
    super(inner['config']);
    this.inner = inner;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    await globalLlmSemaphore.acquire();
    try {
      return await this.inner.generateText(input);
    } finally {
      globalLlmSemaphore.release();
    }
  }

  async *streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput> {
    await globalLlmSemaphore.acquire();
    try {
      for await (const chunk of this.inner.streamText(input)) {
        yield chunk;
      }
    } finally {
      globalLlmSemaphore.release();
    }
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<z.infer<T>> {
    await globalLlmSemaphore.acquire();
    try {
      return await this.inner.generateObject(input);
    } finally {
      globalLlmSemaphore.release();
    }
  }

  async *streamObject<T>(
    input: GenerateObjectInput,
  ): AsyncGenerator<Partial<z.infer<T>>> {
    await globalLlmSemaphore.acquire();
    try {
      for await (const chunk of this.inner.streamObject(input)) {
        yield chunk;
      }
    } finally {
      globalLlmSemaphore.release();
    }
  }
}

export default ThrottledLLM;
