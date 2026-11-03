import type { ReactNode } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { apiErrorMessage } from '../../lib/apiErrors';

/** Page heading block shared by the study and game pages; the h1 receives route focus. */
export function StudyHeader({
  eyebrow,
  title,
  children,
  actions,
  back,
  variant,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string } | undefined;
  variant?: 'page' | 'session';
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={children}
      actions={actions}
      back={back}
      variant={variant}
    />
  );
}

export function LoadingNotice({ children, rows }: { children: ReactNode; rows?: number }) {
  return <LoadingState rows={rows}>{children}</LoadingState>;
}

export function ErrorPanel({
  error,
  retry,
  children,
}: {
  error: unknown;
  retry?: (() => void) | undefined;
  children?: ReactNode;
}) {
  return (
    <ErrorState message={apiErrorMessage(error)} retry={retry}>
      {children}
    </ErrorState>
  );
}
