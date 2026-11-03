import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetViewport } from './browserShims';

// Vitest globals are disabled, so Testing Library cannot register this itself.
afterEach(() => {
  cleanup();
  resetViewport();
});
