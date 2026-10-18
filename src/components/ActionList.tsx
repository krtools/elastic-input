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

interface ActionListProps {
  actions: ActionRow[];
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
}

/** The rows of the bar's ⋯ menu, shown in the sheet: finger-sized, full-width buttons. */
export function ActionList({ actions, colors, styles }: ActionListProps) {
  return (
    <div className="ei-actions" role="menu">
      {actions.map(a => (
        <button
          key={a.id}
          type="button"
          role="menuitem"
          className="ei-action"
          disabled={a.disabled}
          onClick={a.onSelect}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            width: '100%', minHeight: '48px', padding: '0 16px', boxSizing: 'border-box',
            border: 'none', background: 'transparent', textAlign: 'left',
            fontFamily: styles.fontFamily, fontSize: styles.dropdownItemFontSize,
            color: a.disabled ? colors.placeholder : colors.text,
            cursor: a.disabled ? 'default' : 'pointer',
          }}
        >
          <span>{a.label}</span>
          {a.hint ? <span className="ei-action-hint" style={{ color: colors.placeholder }}>{a.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}
