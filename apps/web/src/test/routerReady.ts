import type { createMemoryRouter } from 'react-router';

/** Resolve the actual lazy route before mounting API/UI tests. Queries only start
 * after render, so pending-network/empty/error assertions keep their original meaning.
 * Dedicated routing tests exercise the loading/error boundary itself.
 */
export async function routerReady(router: ReturnType<typeof createMemoryRouter>): Promise<void> {
  if (router.state.initialized) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe((state) => {
      if (state.initialized) {
        unsubscribe();
        resolve();
      }
    });
  });
}
