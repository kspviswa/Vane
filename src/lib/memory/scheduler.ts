import { extractMemories } from './extractor';

const RUN_INTERVAL = 24 * 60 * 60 * 1000;
const STATE_KEY = 'memory_last_extraction';

function getLastExtractionTime(): number | null {
  try {
    const val = process.env.__MEMORY_LAST_EXTRACTION;
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

function setLastExtractionTime() {
  process.env.__MEMORY_LAST_EXTRACTION = String(Date.now());
}

async function runExtraction() {
  console.log(
    `[Memory Scheduler] Starting extraction at ${new Date().toISOString()}`,
  );
  const result = await extractMemories();
  setLastExtractionTime();
  console.log(
    `[Memory Scheduler] Extraction finished: ${result.extracted} memories extracted, ${result.errors} errors`,
  );
}

function startScheduler() {
  const lastRun = getLastExtractionTime();
  const now = Date.now();

  if (lastRun === null || now - lastRun > RUN_INTERVAL) {
    console.log(
      '[Memory Scheduler] Last extraction was more than 24h ago, running now...',
    );
    runExtraction();
  } else {
    const nextRun = new Date(lastRun + RUN_INTERVAL);
    console.log(
      `[Memory Scheduler] Next scheduled extraction at ${nextRun.toISOString()}`,
    );
  }

  setInterval(() => {
    runExtraction();
  }, RUN_INTERVAL);

  console.log(
    `[Memory Scheduler] Scheduler started, running every ${RUN_INTERVAL / 60000} minutes`,
  );
}

const globalForScheduler = globalThis as any;
if (
  !globalForScheduler._memorySchedulerStarted &&
  typeof window === 'undefined' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  globalForScheduler._memorySchedulerStarted = true;

  setTimeout(startScheduler, 10000);
}

export { startScheduler, runExtraction };
