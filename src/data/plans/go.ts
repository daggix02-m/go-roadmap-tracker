import { Plan } from '../../types';

/**
 * Built-in Go backend roadmap. Content preserved verbatim from the original
 * single-plan app; it is now just one plan among potentially many.
 */
export const GO_PLAN: Plan = {
  id: 'go-roadmap',
  name: 'Go Backend Roadmap',
  emoji: '🐹',
  accent: 'accent',
  description: 'Foundations to production',
  cheatsheetId: 'go',
  builtIn: true,
  sections: [
    { id: 'A', title: 'Part A — Foundations' },
    { id: 'B', title: 'Part B — TaskFlow' },
    { id: 'C', title: 'Part C — Production' },
    { id: 'D', title: 'Part D — API & Capstone' }
  ],
  method: "You will build one application continuously — a task manager API with a web UI called TaskFlow — and learn every concept exactly when the application needs it. You never study a topic in the abstract: you hit a wall, then learn the tool that gets you past it. Work top to bottom, and treat every exit criteria as a hard gate — if you cannot check every box, stay in the phase.",
  principle: [
    { step: 'Feel the problem' },
    { step: 'Understand why it is a problem' },
    { step: 'Learn the specific Go concept that solves it' },
    { step: 'Implement it in TaskFlow' },
    { step: 'Test it' },
    { step: 'Move on only when the exit criteria are true' }
  ],
  phases: [
  {
    id: 0,
    section: 'A',

    title: 'Phase 0 — Environment & Workflow',
    shortTitle: 'Environment & Toolchain',
    dense: false,
    estimatedHours: 4,
    what: 'Toolchain setup and fast CLI feedback loop for pure muscle memory.',
    concepts: ['go run', 'go build', 'go fmt', 'go vet', 'go mod', 'gopls'],
    steps: [
      'Install latest Go (1.22+) and verify with `go version`.',
      'Configure code editor with gopls and format-on-save (goimports/gofmt).',
      'Run `go mod init scratch`, write a hello world, run with `go run .`.',
      'Inspect binary output of `go build -o app` vs temporary `go run`.',
      'Run `go fmt ./...` and `go vet ./...` until it becomes automatic muscle memory.'
    ],
    exit: [
      'Can create a new Go module from scratch without looking up docs.',
      'Understand what go.mod and go.sum do.',
      'go run, go build, go fmt, go vet are pure muscle memory.'
    ],
    proTip: 'Go produces single static binaries by default with zero runtime dependencies.',
    codeSnippet: `package main

import "fmt"

func main() {
    fmt.Println("Hello Gopher! TaskFlow roadmap begins.")
}`
  },
  {
    id: 1,
    section: 'A',

    title: 'Phase 1 — Syntax & Control Flow',
    shortTitle: 'Syntax & Error Handling',
    dense: false,
    estimatedHours: 6,
    what: 'Small standalone CLI programs & explicit error returns.',
    concepts: ['types', 'for loops', 'switch', 'error handling', 'bufio.Scanner'],
    steps: [
      'Write a grade calculator CLI utilizing `switch` expressions and type assertions.',
      'Write FizzBuzz to master `for` range, basic loops, and `%` operators.',
      'Build an interactive menu loop with `bufio.NewScanner(os.Stdin)`.',
      'Write a function that returns `(result, error)` and practice `if err != nil` pattern.'
    ],
    exit: [
      'Can write functions with multiple return values and errors fluidly.',
      'Understand why Go uses explicit error returns instead of exceptions.',
      'Comfortable reading unfamiliar Go standard library code.'
    ],
    proTip: 'In Go, errors are normal values. Never ignore them with `_` unless you have explicit justification.',
    codeSnippet: `func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("cannot divide by zero")
    }
    return a / b, nil
}`
  },
  {
    id: 2,
    section: 'A',

    title: 'Phase 2 — Data & Behavior',
    shortTitle: 'Structs, Methods & Memory',
    dense: false,
    estimatedHours: 8,
    what: 'In-memory inventory tracker CLI (precursor to TaskFlow).',
    concepts: ['structs', 'methods', 'pointer receivers', 'slices', 'maps', 'panics'],
    steps: [
      'Define `Product` struct with ID, Name, Price, and Quantity fields.',
      'Write methods comparing value receiver `(p Product)` vs pointer receiver `(p *Product)` to observe mutations.',
      'Build in-memory store: `map[string]Product` with full CRUD operations.',
      'Practice slice sorting, filtering, append operations, and item deletions.',
      'Trigger and observe a nil map write panic and slice out-of-range panic.'
    ],
    exit: [
      'Can explain pointer vs value receiver rules without guessing.',
      'Comfortable using maps and slices as default collections.',
      'Have debugged nil-pointer and index-out-of-range panics.'
    ],
    proTip: 'Use pointer receivers when the method needs to mutate the receiver or when the struct is large.',
    codeSnippet: `type Task struct {
    ID    string
    Title string
    Done  bool
}

// Pointer receiver for state mutation
func (t *Task) MarkComplete() {
    t.Done = true
}`
  },
  {
    id: 3,
    section: 'A',

    title: 'Phase 3 — Interfaces, Errors & Packages',
    shortTitle: 'Interfaces & Package Architecture',
    dense: false,
    estimatedHours: 8,
    what: 'Refactoring Phase 2 inventory app into clean decoupled packages.',
    concepts: ['interfaces', 'implicit satisfaction', 'error wrapping', 'internal/'],
    steps: [
      'Define a `Store` interface to swap in-memory store with file-backed storage.',
      'Implicitly satisfy `Store` with the in-memory map type (no `implements` keyword!).',
      'Write a JSON file storage backend to prove polymorphism in action.',
      'Restructure codebase to `cmd/inventory/` and `internal/inventory/`.',
      'Practice error wrapping with `%w`, `errors.Is()`, and `errors.As()`.'
    ],
    exit: [
      'Defined an interface to solve a polymorphism problem, not just by habit.',
      'Understand implicit interface satisfaction completely.',
      'Can explain why Go compiler strictly enforces `internal/` visibility.',
      'Comfortable unwrapping nested errors with `errors.Is`.'
    ],
    proTip: 'Accept interfaces, return concrete structs. Keep interfaces small (1-2 methods).',
    codeSnippet: `type TaskStorage interface {
    Get(id string) (Task, error)
    Save(task Task) error
}`
  },
  {
    id: 4,
    section: 'B',

    title: 'Phase 4 — First HTTP Server',
    shortTitle: 'HTTP Fundamentals & ListenAndServe',
    dense: false,
    estimatedHours: 5,
    what: 'TaskFlow says Hello over HTTP with net/http.',
    concepts: ['net/http', 'http.ListenAndServe', 'http.Handler', 'curl'],
    steps: [
      'Create new module `taskflow/` with entrypoint at `cmd/web/main.go`.',
      'Write a `GET /` handler responding "Hello, TaskFlow!".',
      'Trace request lifecycle: browser → TCP socket → Go HTTP server → handler → response writer.',
      'Test server with `curl -v http://localhost:4000/` and inspect response status and headers.'
    ],
    exit: [
      'Can boot a server and explain every step of the request lifecycle.',
      'Know the difference between `http.HandleFunc` and `http.Handler`.'
    ],
    codeSnippet: `package main

import (
    "log"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("Hello, TaskFlow!"))
    })
    log.Println("Server starting on :4000")
    log.Fatal(http.ListenAndServe(":4000", mux))
}`
  },
  {
    id: 5,
    section: 'B',

    title: 'Phase 5 — Routing & HTTP Fundamentals',
    shortTitle: 'Go 1.22+ ServeMux Routing',
    dense: false,
    estimatedHours: 6,
    what: 'Routes for tasks: `/`, `/tasks`, `/tasks/{id}` with method matching.',
    concepts: ['http.ServeMux', 'Go 1.22 routing', 'status codes', 'path values', 'query parameters'],
    steps: [
      'Add route patterns `GET /tasks`, `POST /tasks`, `GET /tasks/{id}` using Go 1.22 pattern matching.',
      'Use named status constants (`http.StatusOK`, `http.StatusNotFound`, `http.StatusCreated`).',
      'Handle wrong HTTP methods returning `405 Method Not Allowed` with `Allow` header.',
      'Extract path parameters with `r.PathValue("id")` and parse query strings (`r.URL.Query().Get("done")`).',
      'Manually test all 400, 404, 405 error paths via curl.'
    ],
    exit: [
      'Can add new routes in under a minute without looking at docs.',
      'Instinctively use `http.Status*` constants.',
      'Manually verified at least 4 failure paths with curl.'
    ],
    codeSnippet: `mux.HandleFunc("GET /tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    // Retrieve task by id...
})`
  },
  {
    id: 6,
    section: 'B',

    title: 'Phase 6 — Project Structure',
    shortTitle: 'Standard Project Layout',
    dense: false,
    estimatedHours: 5,
    what: 'Reorganizing TaskFlow into standard scalable Go project layout.',
    concepts: ['cmd/web', 'internal/models', 'ui/html', 'separation of concerns'],
    steps: [
      'Split `main.go` into `main.go`, `handlers.go`, and `routes.go`.',
      'Create `internal/models/` for database models and `ui/html/` for templates.',
      'Enforce rule: Keep `main.go` strictly for wiring dependencies and configuration.'
    ],
    exit: [
      '`main.go` only wires components; zero business logic.',
      'Can articulate why Go projects use this standard structure.'
    ],
    codeSnippet: `taskflow/
├── cmd/web/
│   ├── main.go
│   ├── handlers.go
│   └── routes.go
├── internal/
│   ├── models/
│   └── validator/
├── ui/
│   ├── html/
│   └── static/
└── go.mod`
  },
  {
    id: 7,
    section: 'B',

    title: 'Phase 7 — Templates & Static Files',
    shortTitle: 'HTML Templates & Static Assets',
    dense: false,
    estimatedHours: 6,
    what: 'Render real HTML pages and static CSS assets for TaskFlow.',
    concepts: ['html/template', 'template blocks', 'http.FileServer', 'StripPrefix'],
    steps: [
      'Build `base.html` layout with `<head>`, navigation, and `{{block "main" .}}{{end}}`.',
      'Build `home.html` and `tasks.html` extending base layout.',
      'Serve `ui/static/` via `http.FileServer` combined with `http.StripPrefix`.',
      'Render task lists with `{{range .Tasks}}` pipelines and escaping.'
    ],
    exit: [
      'Can explain template inheritance and the duplication it eliminates.',
      'Static CSS/JS assets load smoothly with proper prefix stripping.'
    ]
  },
  {
    id: 8,
    section: 'B',

    title: 'Phase 8 — Configuration, Logging & Dependency Injection',
    shortTitle: 'Structured Logging & DI',
    dense: true,
    estimatedHours: 8,
    what: 'Central `application` struct holding shared dependencies with structured logging.',
    concepts: ['flag package', 'log/slog', 'dependency injection', 'error helpers'],
    steps: [
      'Add `-addr` and `-env` flags using standard `flag` package.',
      'Replace `fmt.Println` with modern structured `log/slog.New(slog.NewJSONHandler(...))`.',
      'Create `type application struct { logger *slog.Logger }`.',
      'Turn all HTTP handlers into methods on `*application` (e.g. `func (app *application) home(w, r)`).',
      'Write centralized `serverError` and `clientError` helper methods.'
    ],
    exit: [
      'Zero global variables for shared state.',
      'Every handler logs consistently through centralized helpers.',
      'Can explain dependency injection in one concise sentence.'
    ],
    proTip: 'Method receivers on the application struct cleanly provide handlers access to DB pools, loggers, and templates without package-level globals.'
  },
  {
    id: 9,
    section: 'B',

    title: 'Phase 9 — Database Integration (Postgres)',
    shortTitle: 'PostgreSQL & Connection Pools',
    dense: true,
    estimatedHours: 12,
    what: 'Persistent tasks using PostgreSQL, pgx / database/sql, and migrations.',
    concepts: ['database/sql', 'pgx', 'connection pools', 'migrations', 'models'],
    steps: [
      'Install PostgreSQL locally or in Docker; create `tasks` table with primary key UUID or bigserial.',
      'Setup `golang-migrate` or `goose` for versioned up/down SQL migrations.',
      'Connect pool via `pgx` or `database/sql` (`SetMaxOpenConns`, `SetMaxIdleConns`) and inject into `application`.',
      'Create `internal/models/task.go` with `Insert`, `Get`, `Latest`, and `Delete` methods.',
      'Enforce strict rule: Handlers NEVER contain raw SQL queries.'
    ],
    exit: [
      'Tasks survive server restarts and system reboots.',
      'All SQL queries are strictly isolated inside `internal/models/`.',
      'Can explain connection pooling and why new conns aren’t opened per request.'
    ]
  },
  {
    id: 10,
    section: 'B',

    title: 'Phase 10 — Dynamic Templates & Caching',
    shortTitle: 'Template Caching & FuncMap',
    dense: false,
    estimatedHours: 6,
    what: 'Production in-memory template caching and response render buffers.',
    concepts: ['template caching', 'FuncMap', 'render buffers', 'bytes.Buffer'],
    steps: [
      'Create a unified `templateData` struct for passing models, current year, flash alerts, and form errors.',
      'Cache parsed templates once at startup into `map[string]*template.Template`.',
      'Add custom human date formatter helper with `template.FuncMap`.',
      'Render template to an in-memory `bytes.Buffer` before writing to `http.ResponseWriter` to prevent partial 200 responses on render errors.'
    ],
    exit: [
      'Templates parsed once at startup, not on every incoming request.',
      'Understand why writing directly to `ResponseWriter` during template execution is dangerous.'
    ]
  },
  {
    id: 11,
    section: 'B',

    title: 'Phase 11 — Middleware',
    shortTitle: 'Middleware Chaining & Recovery',
    dense: false,
    estimatedHours: 6,
    what: 'Logging, panic recovery, and standard security headers.',
    concepts: ['middleware pattern', 'Handler chaining', 'panic recovery', 'standard headers'],
    steps: [
      'Write `logRequest`, `secureHeaders` (X-Frame-Options, X-Content-Type-Options), and `recoverPanic` middlewares.',
      'Chain middleware sequentially around `http.Handler` (`secureHeaders(recoverPanic(logRequest(mux)))`).',
      'Trigger an intentional panic inside a test handler and verify recovery middleware catches it and sends a clean 500 error.'
    ],
    exit: [
      'Can define middleware as `func(http.Handler) http.Handler`.',
      'Panics in handlers no longer crash the Go server process.',
      'Every request is logged with method, path, remote IP, and latency.'
    ]
  },
  {
    id: 12,
    section: 'B',

    title: 'Phase 12 — Forms & Validation',
    shortTitle: 'Form Processing & PRG Pattern',
    dense: false,
    estimatedHours: 7,
    what: 'Create Task HTML form with validation & Post/Redirect/Get pattern.',
    concepts: ['PRG pattern', 'r.ParseForm()', 'field errors', 'validator pkg'],
    steps: [
      'Build HTML form for creating and updating tasks.',
      'Implement Post/Redirect/Get (PRG) pattern on `POST /tasks` to prevent duplicate submissions.',
      'Create `internal/validator` with helpers: `NotBlank`, `MaxLength`, `MatchesRegex`.',
      'Test missing fields and oversized inputs to ensure form repopulates with contextual validation errors.'
    ],
    exit: [
      'Refreshing browser after form submit never triggers double-posts.',
      'Invalid submissions show clear field errors without wiping user inputs.'
    ]
  },
  {
    id: 13,
    section: 'B',

    title: 'Phase 13 — Sessions & Flash Messages',
    shortTitle: 'Session Management & Cookies',
    dense: false,
    estimatedHours: 6,
    what: 'Confirmation notifications surviving redirects via secure cookie sessions.',
    concepts: ['sessions', 'cookies', 'HttpOnly', 'SameSite', 'alexedwards/scs'],
    steps: [
      'Add session manager (`alexedwards/scs`) backed by PostgreSQL or in-memory store.',
      'Store one-time flash toast message on task creation, display and clear automatically on subsequent GET.',
      'Configure secure cookie flags: `HttpOnly`, `SameSite=Lax`, and `Secure`.'
    ],
    exit: [
      'Flash messages display once and disappear upon subsequent reload.',
      'Understand why `HttpOnly` protects against client-side XSS cookie theft.'
    ]
  },
  {
    id: 14,
    section: 'B',

    title: 'Phase 14 — HTTPS & Security Hardening',
    shortTitle: 'TLS, CSRF & Server Timeouts',
    dense: true,
    estimatedHours: 10,
    what: 'TLS certs, CSRF protection, server timeouts, and body limits.',
    concepts: ['TLS', 'CSRF tokens', 'timeouts', 'MaxBytesReader', 'CSP'],
    steps: [
      'Generate self-signed TLS certificates; run `server.ListenAndServeTLS("tls/cert.pem", "tls/key.pem")`.',
      'Set explicit `ReadTimeout`, `WriteTimeout`, and `IdleTimeout` on `http.Server`.',
      'Add CSRF middleware (`justinas/nosurf`) and inject tokens to all HTML POST forms.',
      'Add `Content-Security-Policy` header and limit request bodies using `http.MaxBytesReader`.',
      'Move database passwords and secrets to `.env` / environment variables.'
    ],
    exit: [
      'Server runs over HTTPS locally without warnings.',
      'CSRF tokens validated on all state-changing requests.',
      'Completed security audit for XSS, CSRF, and unprotected secrets.'
    ]
  },
  {
    id: 15,
    section: 'B',

    title: 'Phase 15 — Authentication',
    shortTitle: 'User Signup, Login & Bcrypt',
    dense: false,
    estimatedHours: 8,
    what: 'User Signup, Login, and Logout with salted password hashing.',
    concepts: ['bcrypt', 'password hashing', 'session auth', 'UserModel'],
    steps: [
      'Create `users` table migration and `UserModel` with email uniqueness constraints.',
      'Hash passwords with `golang.org/x/crypto/bcrypt.GenerateFromPassword`.',
      'Authenticate credentials via `bcrypt.CompareHashAndPassword` and store userID in session.',
      'Implement logout handler that invalidates and destroys session.',
      'Verify plaintext passwords are never logged or stored in database.'
    ],
    exit: [
      'Can signup, login, and logout smoothly end-to-end.',
      'Zero plaintext passwords stored in DB or written to log files.'
    ]
  },
  {
    id: 16,
    section: 'B',

    title: 'Phase 16 — Authorization & Request Context',
    shortTitle: 'RBAC & context.Context',
    dense: false,
    estimatedHours: 7,
    what: 'Task ownership (Users can only view/edit/delete their own tasks).',
    concepts: ['context.Context', 'auth middleware', 'ownership checks', '403 Forbidden'],
    steps: [
      'Write `requireAuthentication` middleware to protect private routes.',
      'Inject authenticated user info into `r.Context()` with custom context key.',
      'Add `user_id` foreign key on `tasks` table with index.',
      'Check ownership on update/delete; return `403 Forbidden` on mismatch.'
    ],
    exit: [
      'Can clearly explain difference between authentication and authorization.',
      'Cross-user unauthorized modification test fails with HTTP 403.'
    ]
  },
  {
    id: 17,
    section: 'B',

    title: 'Phase 17 — Testing',
    shortTitle: 'Unit, Handler & Race Tests',
    dense: true,
    estimatedHours: 12,
    what: 'Comprehensive test suite with mocks and integration tests.',
    concepts: ['httptest', 'table-driven tests', 'mocking interfaces', 'go test -race'],
    steps: [
      'Write table-driven unit tests for validator package.',
      'Test HTTP handlers using `net/http/httptest.NewRecorder()` and `httptest.NewServer()`.',
      'Create interface for `TaskModel` to mock database layer in isolated handler tests.',
      'Write integration test against a live test PostgreSQL database container.',
      'Run `go test -race ./...` and `go test -cover ./...` in CI.'
    ],
    exit: [
      'Suite contains unit, handler, and database integration tests.',
      '`go test -race ./...` passes without data race warnings.',
      'Can explain trade-offs between mocking vs testing against real Postgres.'
    ]
  },
  {
    id: 18,
    section: 'B',

    title: 'Phase 18 — Refactor With Interfaces',
    shortTitle: 'Interface Discipline & Cleanup',
    dense: false,
    estimatedHours: 5,
    what: 'Clean up over-abstractions across the codebase and enforce Go minimalism.',
    concepts: ['interface discipline', 'concrete first', 'simplicity'],
    steps: [
      'Identify premature interfaces and un-abstract them back to concrete structs.',
      'Keep only interfaces used for mocking or multiple implementations.',
      'Adopt the core Go rule: Concrete types first, interfaces only when proven necessary.'
    ],
    exit: [
      'Every interface in codebase has a clear, one-sentence justification.',
      'Removed at least one unnecessary abstraction.'
    ]
  },
  {
    id: 19,
    section: 'C',

    title: 'Phase 19 — Database Production Practices',
    shortTitle: 'SQL Transactions & EXPLAIN',
    dense: false,
    estimatedHours: 8,
    what: 'Transactions with rollback safety, indexing, and query timeouts.',
    concepts: ['SQL transactions', 'EXPLAIN ANALYZE', 'indexes', 'context timeouts'],
    steps: [
      'Wrap multi-step DB actions in SQL transactions (`tx.BeginTx`) with rollback defer.',
      'Seed 10,000+ task rows; profile with `EXPLAIN ANALYZE`; add index and verify speedup.',
      'Pass `context.WithTimeout` to all database queries to prevent connection lockups.'
    ],
    exit: [
      'Measurably improved a slow query with an index with before/after stats.',
      'Every DB call accepts a context timeout.'
    ]
  },
  {
    id: 20,
    section: 'C',

    title: 'Phase 20 — Observability',
    shortTitle: 'Healthz, Metrics & pprof',
    dense: false,
    estimatedHours: 7,
    what: 'Health checks, Prometheus metrics, and pprof runtime profiling.',
    concepts: ['/healthz', 'expvar / Prometheus', 'net/http/pprof', 'flamegraphs'],
    steps: [
      'Add `/healthz` endpoint verifying PostgreSQL connectivity and system health.',
      'Expose request count, latency histogram, and error rate metrics.',
      'Attach `net/http/pprof` handlers and profile CPU/heap under synthetic load (`hey -n 10000`).'
    ],
    exit: [
      'Can query app and DB status via automated HTTP health check.',
      'Profiled CPU/memory with pprof and can interpret flamegraphs and traces.'
    ]
  },
  {
    id: 21,
    section: 'C',

    title: 'Phase 21 — Concurrency in Real Scenarios',
    shortTitle: 'Goroutines, Channels & Shutdown',
    dense: true,
    estimatedHours: 12,
    what: 'Async workers, worker pools, mutexes, and graceful shutdown.',
    concepts: ['goroutines', 'channels', 'sync.WaitGroup', 'sync.Mutex', 'graceful shutdown'],
    steps: [
      'Dispatch async notification emails on task create without blocking the client HTTP handler.',
      'Use separate background context for async jobs (not the terminating request context).',
      'Build worker pool using channels and `sync.WaitGroup` to limit concurrent execution.',
      'Reproduce and resolve a map race condition using `go test -race`.',
      'Implement graceful shutdown on `SIGINT`/`SIGTERM` closing HTTP server and DB pool cleanly.'
    ],
    exit: [
      'Reproduced and fixed a real race condition using Go race detector.',
      'Background jobs do not block HTTP responses.',
      'Server shuts down gracefully on `Ctrl+C` without dropping in-flight connections.'
    ]
  },
  {
    id: 22,
    section: 'C',

    title: 'Phase 22 — Build Tooling & Automation',
    shortTitle: 'Makefile & golangci-lint',
    dense: false,
    estimatedHours: 5,
    what: 'Production Makefile targets and automated static analysis.',
    concepts: ['Makefile', 'golangci-lint', 'automation', 'reproducible builds'],
    steps: [
      'Write a `Makefile` with targets: `run`, `build`, `test`, `test/race`, `migrate/up`, `lint`.',
      'Set up `golangci-lint` config (.golangci.yml) and clean up all codebase warnings.'
    ],
    exit: [
      '`make test` executes entire test suite with one single command.',
      'Linting runs automatically as part of daily workflow.'
    ]
  },
  {
    id: 23,
    section: 'C',

    title: 'Phase 23 — Linux Deployment Fundamentals',
    shortTitle: 'Systemd & Reverse Proxy',
    dense: false,
    estimatedHours: 7,
    what: 'Bare-metal / VPS deployment with systemd daemon & reverse proxy.',
    concepts: ['cross-compilation', 'systemd', 'Caddy / Nginx', 'Let’s Encrypt'],
    steps: [
      'Cross-compile standalone binary: `GOOS=linux GOARCH=amd64 go build -o bin/taskflow cmd/web/main.go`.',
      'Configure systemd service unit file on VPS running as dedicated non-root user.',
      'Setup Caddy or Nginx reverse proxy with automated TLS certificate renewal.'
    ],
    exit: [
      'Deployed standalone Go binary to Linux VM without Docker.',
      'Can describe every networking layer between internet and Go handler.'
    ]
  },
  {
    id: 24,
    section: 'C',

    title: 'Phase 24 — Docker & CI/CD',
    shortTitle: 'Multi-stage Docker & GitHub Actions',
    dense: false,
    estimatedHours: 8,
    what: 'Multi-stage scratch/distroless Docker builds and GitHub Actions automation.',
    concepts: ['distroless / scratch', 'docker-compose', 'GitHub Actions', 'CI pipeline'],
    steps: [
      'Write multi-stage `Dockerfile` compiling with Go toolchain and copying to lightweight `gcr.io/distroless/static-debian12`.',
      'Create `docker-compose.yml` orchestrating TaskFlow app + PostgreSQL container.',
      'Set up GitHub Actions workflow for linting, `-race` tests, and build checks on push.'
    ],
    exit: [
      '`docker compose up` brings up complete local environment.',
      'GitHub commits trigger automated CI pipeline testing and building.'
    ]
  },
  {
    id: 25,
    section: 'D',

    title: 'Phase 25 — REST API Layer',
    shortTitle: 'REST JSON API & Envelopes',
    dense: false,
    estimatedHours: 8,
    what: 'JSON API endpoints alongside web UI (`/api/v1/tasks`).',
    concepts: ['JSON encoding/decoding', 'error envelopes', 'API validation', 'REST standards'],
    steps: [
      'Build REST endpoints: `GET/POST /api/v1/tasks`, `GET/PATCH/DELETE /api/v1/tasks/{id}`.',
      'Standardize JSON error response envelope `{"error": "message"}`.',
      'Implement strict JSON validation helper for incoming request payloads with max body sizes.'
    ],
    exit: [
      'Consistent JSON error format across all failure scenarios.',
      'Full CRUD operations possible purely via curl with JSON payloads.'
    ]
  },
  {
    id: 26,
    section: 'D',

    title: 'Phase 26 — Filtering, Sorting, Pagination',
    shortTitle: 'Query Filters & Pagination',
    dense: false,
    estimatedHours: 8,
    what: 'Search, safelisted sorting, and keyset/offset pagination.',
    concepts: ['query filters', 'safelist sorting', 'pagination metadata', 'SQL injection defense'],
    steps: [
      'Add `?status=done&title=gopher` query parameter filtering in SQL queries.',
      'Add safelisted sorting `?sort=-created_at` (protect against dynamic SQL injection).',
      'Implement pagination returning `total_records`, `page`, `page_size`, and `last_page` metadata.'
    ],
    exit: [
      'Sorting strictly rejects non-safelisted columns.',
      'Pagination metadata is accurate across large datasets.'
    ]
  },
  {
    id: 27,
    section: 'D',

    title: 'Phase 27 — Token Auth, Rate Limiting, CORS',
    shortTitle: 'Token Auth & Rate Limiting',
    dense: false,
    estimatedHours: 9,
    what: 'Stateless API security layer with token auth and token-bucket rate limiting.',
    concepts: ['bearer tokens / JWT', 'token bucket rate limiting', 'CORS headers', 'IP throttling'],
    steps: [
      'Add Bearer token authentication for API routes and contrast with session cookies.',
      'Build token bucket rate limiter middleware (`golang.org/x/time/rate`) per client IP.',
      'Configure explicit CORS middleware headers for frontend SPA domains.'
    ],
    exit: [
      'Can articulate trade-offs of Cookies vs Bearer Tokens.',
      'Exceeding rate limits returns `429 Too Many Requests`.'
    ]
  },
  {
    id: 28,
    section: 'D',

    title: 'Phase 28 — Background Jobs & Capstone',
    shortTitle: 'Capstone: Recurring Tasks Engine',
    dense: false,
    estimatedHours: 14,
    what: 'Persistent job queues & final capstone feature (Recurring Tasks).',
    concepts: ['Redis/Postgres queues', 'retries', 'idempotency', 'capstone architecture'],
    steps: [
      'Move notification goroutine to persistent job queue with retries and exponential backoff.',
      'Build Capstone: "Recurring Tasks" engine touching migrations, models, API, UI, auth, worker pool, and tests end-to-end.',
      'Record walkthrough video or write architecture doc explaining the entire codebase.'
    ],
    exit: [
      'Capstone feature is fully tested, authorized, and deployed.',
      'Can walk through entire codebase explaining every architecture decision.'
    ]
  }
]
};
