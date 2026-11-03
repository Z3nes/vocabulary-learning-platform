import { useEffect } from 'react';

export const APP_NAME = 'Kelime Çalışma Platformu';

export function formatDocumentTitle(pageTitle: string): string {
  return `${pageTitle} · ${APP_NAME}`;
}

/** Sets `document.title` to "<page title> · Kelime Çalışma Platformu". */
export function useDocumentTitle(pageTitle: string) {
  useEffect(() => {
    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
}
