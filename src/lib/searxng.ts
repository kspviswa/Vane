import { getSearxngURL } from './config/serverRegistry';
import { withRetry } from './utils/withRetry';
import { RetryStatus } from './utils/withRetry';

export interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
  onRetryStatus?: (status: RetryStatus) => void;
}

interface SearxngSearchResult {
  title: string;
  url: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  iframe_src?: string;
}

export const searchSearxng = async (
  query: string,
  opts?: SearxngSearchOptions,
) => {
  const searxngURL = getSearxngURL();

  const url = new URL(`${searxngURL}/search?format=json`);
  url.searchParams.append('q', query);

  if (opts) {
    Object.keys(opts).forEach((key) => {
      const value = opts[key as keyof SearxngSearchOptions];
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(','));
        return;
      }
      url.searchParams.append(key, value as string);
    });
  }

  const { onRetryStatus, ...searchOpts } = opts || {};

  const performSearch = async (signal: AbortSignal) => {
    const res = await fetch(url, { signal });

    if (!res.ok) {
      throw new Error(`SearXNG error: ${res.statusText}`);
    }

    const data = await res.json();
    const results: SearxngSearchResult[] = data.results;
    const suggestions: string[] = data.suggestions;

    return { results, suggestions };
  };

  return withRetry<{ results: SearxngSearchResult[]; suggestions: string[] }>(
    performSearch,
    {
      timeout: 10000,
      maxRetries: 3,
      onStatus: onRetryStatus,
    },
  );
};
