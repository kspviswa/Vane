export interface RetryStatus {
  attempt: number;
  maxRetries: number;
  phase: 'timeout' | 'retrying' | 'give_up';
  error?: Error;
  message: string;
}

export interface RetryOptions {
  maxRetries?: number;
  timeout?: number;
  onStatus?: (status: RetryStatus) => void;
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const timeout = options?.timeout ?? 30000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      options?.onStatus?.({
        attempt,
        maxRetries,
        phase: 'timeout',
        message: `Request timed out after ${timeout / 1000}s (attempt ${attempt}/${maxRetries})`,
      });
    }, timeout);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        lastError = new Error(
          `Timed out after ${timeout / 1000}s (attempt ${attempt}/${maxRetries})`,
        );
      } else {
        lastError = error;
      }

      if (attempt < maxRetries) {
        options?.onStatus?.({
          attempt,
          maxRetries,
          phase: 'retrying',
          error: lastError,
          message: `Attempt ${attempt}/${maxRetries} failed, retrying...`,
        });
      } else {
        options?.onStatus?.({
          attempt,
          maxRetries,
          phase: 'give_up',
          error: lastError,
          message: `Gave up after ${maxRetries} attempts: ${lastError!.message}`,
        });
      }
    }
  }

  throw lastError!;
}

export async function withRetryStream<T>(
  createStream: (signal: AbortSignal) => AsyncGenerator<T>,
  options?: RetryOptions,
): Promise<AsyncGenerator<T>> {
  const maxRetries = options?.maxRetries ?? 3;
  const timeout = options?.timeout ?? 30000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const stream = createStream(controller.signal);

    const iterator = stream[Symbol.asyncIterator]();
    const firstChunkPromise = iterator.next();

    const timeoutPromise = new Promise<IteratorResult<T>>((_, reject) => {
      const id = setTimeout(() => {
        controller.abort();
        reject(new Error('timeout'));
      }, timeout);
      firstChunkPromise.finally(() => clearTimeout(id));
    });

    try {
      const firstChunk = await Promise.race([firstChunkPromise, timeoutPromise]);

      if (firstChunk.done) {
        return (async function* () {})();
      }

      const controller2 = new AbortController();

      const streamWithTimeoutCheck = async function* () {
        yield firstChunk.value;
        for await (const chunk of stream) {
          yield chunk;
        }
      };

      return streamWithTimeoutCheck();
    } catch (error: any) {
      if (error.message === 'timeout') {
        options?.onStatus?.({
          attempt,
          maxRetries,
          phase: 'timeout',
          message: `Stream timed out waiting for first response (attempt ${attempt}/${maxRetries})`,
        });
        lastError = new Error(
          `Stream timed out after ${timeout / 1000}s (attempt ${attempt}/${maxRetries})`,
        );
      } else {
        lastError = error;
      }

      if (attempt < maxRetries) {
        options?.onStatus?.({
          attempt,
          maxRetries,
          phase: 'retrying',
          error: lastError,
          message: `Attempt ${attempt}/${maxRetries} failed, retrying...`,
        });
      } else {
        options?.onStatus?.({
          attempt,
          maxRetries,
          phase: 'give_up',
          error: lastError,
          message: `Gave up after ${maxRetries} attempts: ${lastError!.message}`,
        });
      }
    }
  }

  throw lastError!;
}
