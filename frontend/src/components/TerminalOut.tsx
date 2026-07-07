export default function TerminalOut({
  title,
  lines,
  variant = 'default',
}: {
  title?: string;
  lines: string;
  variant?: 'default' | 'ok' | 'bad';
}) {
  const preview = lines.trim() || '(no output yet)';
  return (
    <div className={`terminal-out terminal-${variant}`}>
      {title && (
        <div className="terminal-title">
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          {title}
        </div>
      )}
      <pre className="terminal-body">{preview}</pre>
    </div>
  );
}
