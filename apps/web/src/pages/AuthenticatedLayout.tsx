import { MotionConfig } from 'motion/react';
import { ServerState } from '../lib/ServerState';

/** Keep query state and application motion dependencies off the public route. */
export function AuthenticatedLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <ServerState />
    </MotionConfig>
  );
}
