import React, { useState } from 'react';
import { X, Copy, Check, TerminalSquare } from 'lucide-react';

interface GoCheatsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoCheatsheetModal: React.FC<GoCheatsheetModalProps> = ({ isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const cheatsheets = [
    {
      title: 'Toolchain & modules',
      items: [
        {
          key: 'mod-init',
          label: 'Initialize a module',
          code: 'go mod init taskflow'
        },
        {
          key: 'run-build',
          label: 'Run & build',
          code: 'go run ./cmd/web\ngo build -o bin/taskflow ./cmd/web'
        },
        {
          key: 'fmt-vet',
          label: 'Format & static analysis',
          code: 'go fmt ./...\ngo vet ./...\ngolangci-lint run'
        },
        {
          key: 'test-race',
          label: 'Tests with race detector & coverage',
          code: 'go test -race -v ./...\ngo test -cover ./...'
        }
      ]
    },
    {
      title: 'Routing (Go 1.22+ ServeMux)',
      items: [
        {
          key: 'routing-mux',
          label: 'Method-aware routes & path values',
          code: `mux := http.NewServeMux()
mux.HandleFunc("GET /tasks", app.listTasks)
mux.HandleFunc("POST /tasks", app.createTask)
mux.HandleFunc("GET /tasks/{id}", app.getTask)

// Extract a path parameter:
id := r.PathValue("id")`
        }
      ]
    },
    {
      title: 'Structured logging (log/slog)',
      items: [
        {
          key: 'slog-init',
          label: 'JSON handler setup',
          code: `logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
logger.Info("server starting", "addr", ":4000", "env", "production")`
        }
      ]
    },
    {
      title: 'Database pool (pgx / database/sql)',
      items: [
        {
          key: 'db-pool',
          label: 'Connection pooling parameters',
          code: `db, err := sql.Open("pgx", dsn)
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(25)
db.SetConnMaxIdleTime(5 * time.Minute)
db.SetConnMaxLifetime(2 * time.Hour)`
        }
      ]
    },
    {
      title: 'Concurrency patterns',
      items: [
        {
          key: 'worker-pool',
          label: 'Bounded concurrency with channels',
          code: `func worker(jobs <-chan Task, results chan<- error, wg *sync.WaitGroup) {
    defer wg.Done()
    for task := range jobs {
        results <- processTask(task)
    }
}`
        }
      ]
    }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go cheatsheet"
        className="w-full max-w-lg bg-surface border border-line rounded-xl p-5 sm:p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close cheatsheet"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <TerminalSquare className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold text-text">Go cheatsheet</h2>
        </div>
        <p className="text-xs text-muted mb-5 leading-relaxed">
          The commands and patterns this roadmap uses most.
        </p>

        <div className="space-y-5">
          {cheatsheets.map((section) => (
            <section key={section.title}>
              <h3 className="text-xs font-semibold text-text mb-2.5">{section.title}</h3>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.key}>
                    <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
                      <span>{item.label}</span>
                      <button
                        onClick={() => copyToClipboard(item.code, item.key)}
                        className="flex items-center gap-1 text-muted hover:text-text transition-colors cursor-pointer font-mono"
                      >
                        {copiedKey === item.key ? (
                          <>
                            <Check className="w-3 h-3 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 rounded-md bg-page border border-line text-xs font-mono text-text/90 overflow-x-auto leading-relaxed">
                      <code>{item.code}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
