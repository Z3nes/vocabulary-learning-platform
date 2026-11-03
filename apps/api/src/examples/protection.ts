import { ApplicationError } from '../http/errors.js';

/** Actual HTTP requests only: four slots, twelve waiters, one-second maximum wait. */
export class UpstreamGate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private readonly max = 4,
    private readonly maxWaiting = 12,
    private readonly waitMs = 1000,
  ) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.maxWaiting) throw new ApplicationError(503, 'EXAMPLES_BUSY');
      await new Promise<void>((resolve, reject) => {
        const resume = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          this.waiting = this.waiting.filter((item) => item !== resume);
          reject(new ApplicationError(503, 'EXAMPLES_BUSY'));
        }, this.waitMs);
        this.waiting.push(resume);
      });
    } else this.active++;
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next)
        next(); // Transfer the slot; do not briefly expose a fifth slot.
      else this.active--;
    }
  }
}
export const upstreamGate = new UpstreamGate();
