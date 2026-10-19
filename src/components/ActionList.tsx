import * as React from 'react';
import { ColorConfig, StyleConfig } from '../types';

/** One row of the bar's actions menu. */
export interface ActionRow {
  id: string;
  label: string;
  /** Muted text at the right edge (the trigger character for the built-ins). */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Several small actions sharing one row, as equal segments. */
export interface ActionGroup {
  id: string;
  segments: ActionRow[];
}

export type ActionEntry = ActionRow | ActionGroup;

const isGroup = (entry: ActionEntry): entry is ActionGroup => 'segments' in entry;

interface ActionListProps {
  actions: ActionEntry[];
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
}

/** The rows of the bar's ⋯ menu, shown in the sheet: finger-sized, full-width buttons. */
export function ActionList({ actions, colors, styles }: ActionListProps) {
  const buttonBase: React.CSSProperties = {
    minHeight: '48px', boxSizing: 'border-box', border: 'none', background: 'transparent',
    fontFamily: styles.fontFamily, fontSize: styles.dropdownItemFontSize,
  };
  const row = (a: ActionRow, extra: React.CSSProperties, className: string) => (
    <button
      key={a.id}
      type="button"
      role="menuitem"
      className={className}
      disabled={a.disabled}
      onClick={a.onSelect}
      style={{
        ...buttonBase,
        ...extra,
        color: a.disabled ? colors.placeholder : colors.text,
        cursor: a.disabled ? 'default' : 'pointer',
      }}
    >
      <span>{a.label}</span>
      {a.hint ? <span className="ei-action-hint" style={{ color: colors.placeholder }}>{a.hint}</span> : null}
    </button>
  );
  return (
    <div className="ei-actions" role="menu">
      {actions.map(entry => isGroup(entry) ? (
        <div key={entry.id} className="ei-action-group" role="group" style={{ display: 'flex', borderBottom: `1px solid ${styles.dropdownBorderColor}` }}>
          {entry.segments.map((a, i) => row(a, {
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
            borderLeft: i > 0 ? `1px solid ${styles.dropdownBorderColor}` : 'none',
          }, 'ei-action ei-action-segment'))}
        </div>
      ) : row(entry, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        width: '100%', padding: '0 16px', textAlign: 'left',
      }, 'ei-action'))}
    </div>
  );
}
