import { useRef } from 'react';

// Native disclosure works with mouse, keyboard and touch without covering controls.
export default function ContextHelp({ title, children }) {
  const disclosure = useRef(null);
  return (
    <details className="context-help" ref={disclosure} onKeyDown={event => {
      if (event.key === 'Escape' && disclosure.current.open) {
        event.stopPropagation();
        disclosure.current.open = false;
        disclosure.current.querySelector('summary').focus();
      }
    }}>
      <summary>{title}</summary>
      <div className="context-help__body">{children}</div>
    </details>
  );
}
