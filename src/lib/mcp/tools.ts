import { searchSearxng, SearxngSearchOptions } from '../searxng';
import Scraper from '../scraper';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const searchTool: ToolDefinition = {
  name: 'search',
  description:
    'Search the web using SearxNG meta-search engine. Returns search results with titles, URLs, and content snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search categories (e.g., "general", "images", "news")',
      },
      engines: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Specific engines to use (e.g., "google", "arxiv", "reddit")',
      },
      language: {
        type: 'string',
        description: 'Language for search results (e.g., "en", "fr")',
      },
      pageno: {
        type: 'number',
        description: 'Page number for pagination (starts at 1)',
      },
    },
    required: ['query'],
  },
};

const crawlAsHtmlTool: ToolDefinition = {
  name: 'crawl_as_html',
  description:
    'Crawl a URL and return the raw HTML content along with the page title.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to crawl',
      },
    },
    required: ['url'],
  },
};

const crawlAsMdTool: ToolDefinition = {
  name: 'crawl_as_md',
  description:
    'Crawl a URL and return the extracted text content formatted as Markdown.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to crawl',
      },
    },
    required: ['url'],
  },
};

const crawlBatchTool: ToolDefinition = {
  name: 'crawl_batch',
  description:
    'Crawl multiple URLs in parallel and return their content. Returns an array of results with url, title, and content for each URL.',
  inputSchema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of URLs to crawl (max 10)',
      },
    },
    required: ['urls'],
  },
};

export const toolDefinitions: ToolDefinition[] = [
  searchTool,
  crawlAsHtmlTool,
  crawlAsMdTool,
  crawlBatchTool,
];

async function handleSearch(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) {
    return {
      content: [{ type: 'text', text: 'Error: query is required' }],
      isError: true,
    };
  }

  const opts: SearxngSearchOptions = {};
  if (args.categories) opts.categories = args.categories as string[];
  if (args.engines) opts.engines = args.engines as string[];
  if (args.language) opts.language = args.language as string;
  if (args.pageno) opts.pageno = args.pageno as number;

  try {
    const result = await searchSearxng(query, opts);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Search failed: ${err.message}` }],
      isError: true,
    };
  }
}

async function handleCrawlAsHtml(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    const result = await Scraper.scrapeHTML(url);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { title: result.title, html: result.html },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        { type: 'text', text: `Crawl failed for ${url}: ${err.message}` },
      ],
      isError: true,
    };
  }
}

async function handleCrawlAsMd(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    const result = await Scraper.scrape(url);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { title: result.title, content: result.content },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        { type: 'text', text: `Crawl failed for ${url}: ${err.message}` },
      ],
      isError: true,
    };
  }
}

async function handleCrawlBatch(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const urls = args.urls as string[];
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return {
      content: [{ type: 'text', text: 'Error: urls array is required' }],
      isError: true,
    };
  }

  const maxUrls = 10;
  const urlsToCrawl = urls.slice(0, maxUrls);

  try {
    const results = await Promise.all(
      urlsToCrawl.map(async (url) => {
        try {
          const result = await Scraper.scrape(url);
          return { url, title: result.title, content: result.content };
        } catch (err: any) {
          return {
            url,
            title: 'Failed',
            content: `Error: ${err.message}`,
          };
        }
      }),
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [
        { type: 'text', text: `Batch crawl failed: ${err.message}` },
      ],
      isError: true,
    };
  }
}

const toolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<ToolResult>
> = {
  search: handleSearch,
  crawl_as_html: handleCrawlAsHtml,
  crawl_as_md: handleCrawlAsMd,
  crawl_batch: handleCrawlBatch,
};

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = toolHandlers[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  return handler(args);
}
