import * as React from 'react';
import { ValidationError } from '../validation/Validator';
import { ColorConfig, StyleConfig } from '../types';
import { mergeColors, mergeStyles, getSquigglyStyle } from '../styles/inlineStyles';

interface ValidationSquigglesProps {
  errors: ValidationError[];
  editorRef: HTMLDivElement | null;
  cursorOffset: number;
  colors?: ColorConfig;
  styles?: StyleConfig;
  containerRef?: HTMLDivElement | null;
}

interface SquigglyRect {
  left: number;
  top: number;
  width: number;
  height: number;
  error: ValidationError;
}

function findPositionAtOffset(
  parent: Node,
  targetOffset: number
): { node: Node; offset: number } | null {
  let currentOffset = 0;

  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (currentOffset + len >= targetOffset) {
        return { node, offset: targetOffset - currentOffset };
      }
      currentOffset += len;
      return null;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const result = walk(node.childNodes[i]);
      if (result) return result;
    }
    return null;
  };

  return walk(parent);
}

function getOffsetPositions(
  editor: HTMLElement,
  start: number,
  end: number
): { left: number; top: number; width: number; height: number } | null {
  const startPos = findPositionAtOffset(editor, start);
  const endPos = findPositionAtOffset(editor, end);

  if (!startPos || !endPos) return null;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const rangeRect = range.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();

  return {
    left: rangeRect.left - editorRect.left,
    top: rangeRect.top - editorRect.top,
    width: Math.max(rangeRect.width, 6),
    height: rangeRect.height,
  };
}

function getSquigglyRects(
  errors: ValidationError[],
  editorRef: HTMLDivElement | null,
  cursorOffset: number
): SquigglyRect[] {
  if (!editorRef || errors.length === 0) return [];

  const rects: SquigglyRect[] = [];

  for (const error of errors) {
    // Deferred display: don't show error if cursor is within the error range
    if (cursorOffset >= error.start && cursorOffset <= error.end) {
      continue;
    }

    const positions = getOffsetPositions(editorRef, error.start, error.end);
    if (positions) {
      rects.push({
        left: positions.left,
        top: positions.top,
        width: positions.width,
        height: positions.height,
        error,
      });
    }
  }

  return rects;
}

export function ValidationSquiggles({ errors, editorRef, cursorOffset, colors, styles, containerRef }: ValidationSquigglesProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const rectsRef = React.useRef<SquigglyRect[]>([]);

  const rects = getSquigglyRects(errors, editorRef, cursorOffset);
  rectsRef.current = rects;

  // Track mouse position at the container level to detect hover over error text
  // without blocking clicks on the editor
  React.useEffect(() => {
    const container = containerRef;
    if (!container || !editorRef) return;

    const handleMouseMove = (e: MouseEvent) => {
      const editorRect = editorRef.getBoundingClientRect();
      const mx = e.clientX - editorRect.left;
      const my = e.clientY - editorRect.top;

      let found = -1;
      for (let i = 0; i < rectsRef.current.length; i++) {
        const r = rectsRef.current[i];
        // Hit test against the text area + wave area below it
        if (mx >= r.left && mx <= r.left + r.width &&
            my >= r.top && my <= r.top + r.height + 6) {
          found = i;
          break;
        }
      }
      setHoveredIndex(found >= 0 ? found : null);
    };

    const handleMouseLeave = () => {
      setHoveredIndex(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [containerRef, editorRef]);

  if (rects.length === 0) return null;

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);

  // Get the editor's full height so tooltip can be placed below the input
  const editorHeight = editorRef ? editorRef.offsetHeight : 0;

  const makeTooltipStyle = (r: SquigglyRect): React.CSSProperties => ({
    position: 'absolute',
    top: `${editorHeight - (r.top + r.height - 2) + 4}px`,
    left: '0',
    zIndex: mergedStyles.dropdownZIndex,
    backgroundColor: mergedColors.background,
    color: mergedColors.error,
    border: `1px solid ${mergedColors.error}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    fontFamily: mergedStyles.fontFamily,
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    userSelect: 'none',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  });

  function squigglyBgForColor(hexColor: string) {
    const encoded = hexColor.replace('#', '%23');
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q2 0 4 2 Q6 4 8 2' stroke='${encoded}' fill='none' stroke-width='0.8'/%3E%3C/svg%3E")`;
  }

  return React.createElement(React.Fragment, null,
    ...rects.map((r, i) => {
      const isWarning = r.error.severity === 'warning';
      const squigglyColor = isWarning ? mergedColors.warning : mergedColors.error;
      const svgBg = squigglyBgForColor(squigglyColor);
      // Position the wave just under the text
      const waveTop = r.top + r.height - 2;

      const tooltipStyle: React.CSSProperties = {
        ...makeTooltipStyle(r),
        color: squigglyColor,
        borderColor: squigglyColor,
      };

      return [
        // Wave underline — pointerEvents none so it never blocks the editor
        React.createElement('div', {
          key: `wave-${i}`,
          style: {
            position: 'absolute' as const,
            left: `${r.left}px`,
            top: `${waveTop}px`,
            width: `${r.width}px`,
            height: '4px',
            zIndex: 1,
            backgroundImage: svgBg,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'left top',
            backgroundSize: 'auto 4px',
            pointerEvents: 'none' as const,
          },
        },
          // Tooltip anchored to the wave position, shown when hovered
          hoveredIndex === i
            ? React.createElement('div', {
                style: tooltipStyle,
              }, r.error.message)
            : null,
        ),
      ];
    })
  );
}
