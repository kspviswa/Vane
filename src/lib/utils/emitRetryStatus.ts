import SessionManager from '@/lib/session';
import { ResearchBlock, TimeoutResearchBlock, RetryingResearchBlock, GaveUpResearchBlock } from '@/lib/types';
import { RetryStatus } from './withRetry';

export function createRetryStatusHandler(
  session: SessionManager,
  researchBlockId: string | undefined,
) {
  return (status: RetryStatus) => {
    if (!researchBlockId) return;

    const block = session.getBlock(researchBlockId) as ResearchBlock | null;
    if (!block || block.type !== 'research') return;

    const id = crypto.randomUUID();

    if (status.phase === 'timeout') {
      const subStep: TimeoutResearchBlock = {
        id,
        type: 'timeout',
        message: status.message,
        attempt: status.attempt,
        maxRetries: status.maxRetries,
      };
      block.data.subSteps.push(subStep);
    } else if (status.phase === 'retrying') {
      const subStep: RetryingResearchBlock = {
        id,
        type: 'retrying',
        attempt: status.attempt,
        maxRetries: status.maxRetries,
      };
      block.data.subSteps.push(subStep);
    } else if (status.phase === 'give_up') {
      const subStep: GaveUpResearchBlock = {
        id,
        type: 'gave_up',
        message: status.message,
      };
      block.data.subSteps.push(subStep);
    }

    session.updateBlock(researchBlockId, [
      {
        op: 'replace',
        path: '/data/subSteps',
        value: block.data.subSteps,
      },
    ]);
  };
}
