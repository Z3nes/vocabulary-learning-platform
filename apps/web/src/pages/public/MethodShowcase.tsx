import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { MethodVisual } from './MethodVisuals';
import { interactiveMethods, methodTabId, methods, type MethodId } from './landingContent';

const panelId = 'yontem-sahnesi';
const keyOffsets: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/**
 * Index of the ten study activities (a WAI-ARIA tab list) and a stage that shows
 * the selected one. Arrow keys, Home and End move between activities; selection
 * follows focus. The stage remounts per activity, so demonstrations start fresh.
 */
export function MethodShowcase({
  active,
  onSelect,
}: {
  active: MethodId;
  onSelect: (id: MethodId) => void;
}) {
  const tabs = useRef(new Map<MethodId, HTMLButtonElement>());
  const index = Math.max(
    0,
    methods.findIndex((method) => method.id === active),
  );
  const current = methods[index]!;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, from: number) {
    const last = methods.length - 1;
    const offset = keyOffsets[event.key];
    const to =
      offset !== undefined
        ? (from + offset + methods.length) % methods.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null;
    if (to === null) return;
    event.preventDefault();
    const target = methods[to]!;
    onSelect(target.id);
    tabs.current.get(target.id)?.focus();
  }

  return (
    <div className="lp-methods">
      <div className="lp-method-index" role="tablist" aria-label="Çalışma yolları">
        {methods.flatMap((method, i) => {
          const tabId = methodTabId(method.id);
          const selected = method.id === active;
          // Group labels are visual only; aria-hidden keeps the tab list's children all tabs.
          const group =
            i === 0 || methods[i - 1]!.area !== method.area
              ? [
                  <p key={`${method.area}-group`} className="lp-method-group" aria-hidden="true">
                    {method.area}
                  </p>,
                ]
              : [];
          return [
            ...group,
            <button
              key={method.id}
              ref={(node) => {
                if (node) tabs.current.set(method.id, node);
                else tabs.current.delete(method.id);
              }}
              id={tabId}
              type="button"
              role="tab"
              className="lp-method-tab"
              aria-selected={selected}
              aria-controls={panelId}
              aria-labelledby={`${tabId}-ad`}
              aria-describedby={`${tabId}-ozet`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(method.id)}
              onKeyDown={(event) => onKeyDown(event, i)}
            >
              <span className="lp-method-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span id={`${tabId}-ad`} className="lp-method-name">
                {method.name}
              </span>
              <span id={`${tabId}-ozet`} className="lp-method-summary">
                {method.summary}
              </span>
            </button>,
          ];
        })}
      </div>
      <div
        key={current.id}
        id={panelId}
        role="tabpanel"
        className="lp-stage"
        aria-labelledby={methodTabId(current.id)}
        // A stage without its own controls is made focusable, as the tabs pattern recommends.
        tabIndex={interactiveMethods.has(current.id) ? undefined : 0}
      >
        <div className="lp-stage-visual" data-method={current.id}>
          <span className="lp-stage-num" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <MethodVisual id={current.id} />
          {interactiveMethods.has(current.id) ? (
            <p className="lp-stage-badge">
              <span aria-hidden="true" />
              Burada dene · Kaydedilmez
            </p>
          ) : null}
        </div>
        <div className="lp-stage-caption">
          <p className="lp-stage-path">
            {current.area} <span aria-hidden="true">›</span> {current.name}
            <span className="lp-stage-count">
              {' '}
              · {index + 1} / {methods.length}
            </span>
          </p>
          <h3>{current.name}</h3>
          <p>{current.detail}</p>
        </div>
      </div>
    </div>
  );
}
