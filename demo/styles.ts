export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentText: string;
  codeBg: string;
}

export const lightTheme: ThemeColors = {
  bg: '#f6f8fa',
  surface: '#ffffff',
  surfaceHover: '#f3f4f6',
  text: '#1f2328',
  textSecondary: '#656d76',
  border: '#d0d7de',
  accent: '#0969da',
  accentText: '#ffffff',
  codeBg: '#f0f3f6',
};

export const darkTheme: ThemeColors = {
  bg: '#0d1117',
  surface: '#161b22',
  surfaceHover: '#1c2128',
  text: '#c9d1d9',
  textSecondary: '#8b949e',
  border: '#30363d',
  accent: '#58a6ff',
  accentText: '#0d1117',
  codeBg: '#1c2128',
};

export function getAppStyles(theme: ThemeColors) {
  return {
    app: {
      minHeight: '100vh',
      backgroundColor: theme.bg,
      color: theme.text,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      transition: 'background-color 0.2s, color 0.2s',
    } as React.CSSProperties,
    header: {
      padding: '24px 32px',
      borderBottom: `1px solid ${theme.border}`,
      backgroundColor: theme.surface,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as React.CSSProperties,
    title: {
      fontSize: '20px',
      fontWeight: 700,
      color: theme.text,
    } as React.CSSProperties,
    subtitle: {
      fontSize: '13px',
      color: theme.textSecondary,
      marginTop: '4px',
    } as React.CSSProperties,
    themeToggle: {
      padding: '6px 12px',
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      backgroundColor: theme.surface,
      color: theme.text,
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 500,
    } as React.CSSProperties,
    main: {
      maxWidth: '900px',
      margin: '0 auto',
      padding: '32px 24px',
    } as React.CSSProperties,
    searchSection: {
      marginBottom: '32px',
    } as React.CSSProperties,
    searchRow: {
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-start',
    } as React.CSSProperties,
    searchButton: {
      padding: '8px 20px',
      backgroundColor: theme.accent,
      color: theme.accentText,
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 600,
      height: '40px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    tabs: {
      display: 'flex',
      gap: '0',
      borderBottom: `1px solid ${theme.border}`,
      marginBottom: '24px',
    } as React.CSSProperties,
    tab: (active: boolean) => ({
      padding: '8px 16px',
      border: 'none',
      borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
      backgroundColor: 'transparent',
      color: active ? theme.accent : theme.textSecondary,
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: active ? 600 : 400,
    } as React.CSSProperties),
    card: {
      backgroundColor: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
    } as React.CSSProperties,
    cardTitle: {
      fontSize: '14px',
      fontWeight: 600,
      marginBottom: '8px',
      color: theme.text,
    } as React.CSSProperties,
    inspector: {
      backgroundColor: theme.codeBg,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '16px',
      marginTop: '16px',
      fontSize: '12px',
      fontFamily: "'SF Mono', Consolas, monospace",
      maxHeight: '300px',
      overflowY: 'auto' as const,
      whiteSpace: 'pre-wrap' as const,
      color: theme.text,
    } as React.CSSProperties,
    inspectorToggle: {
      padding: '4px 8px',
      border: `1px solid ${theme.border}`,
      borderRadius: '4px',
      backgroundColor: theme.surface,
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: '12px',
    } as React.CSSProperties,
    featureGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '12px',
      marginTop: '24px',
    } as React.CSSProperties,
    featureCard: {
      backgroundColor: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '16px',
    } as React.CSSProperties,
    featureTitle: {
      fontSize: '13px',
      fontWeight: 600,
      marginBottom: '4px',
      color: theme.text,
    } as React.CSSProperties,
    featureDesc: {
      fontSize: '12px',
      color: theme.textSecondary,
      lineHeight: 1.4,
    } as React.CSSProperties,
    queryResult: {
      marginTop: '12px',
      padding: '8px 12px',
      backgroundColor: theme.codeBg,
      borderRadius: '6px',
      fontSize: '13px',
      fontFamily: "'SF Mono', Consolas, monospace",
      color: theme.textSecondary,
    } as React.CSSProperties,
  };
}
