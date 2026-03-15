# RAM Design Studio

Community design submission pipeline built on ZenBin + GitHub.

## How it works

1. **Submit** — Users describe an app idea at [design-submit-3](https://zenbin.org/p/design-submit-3). The form creates a `ds-req-{slug}` ZenBin page with the submission JSON — no credentials required in the browser.

2. **Process** — An hourly agent runs `process-zenbin-queue.js`, which scans for new submission slugs, generates a 10-screen `.pen` design (5 mobile + 5 desktop), and publishes it to ZenBin.

3. **Browse** — The [gallery](https://zenbin.org/p/design-gallery-2) reads a public registry from this repo (`design-studio-queue/queue.json`) and lists all published designs.

## Files

| File | Purpose |
|------|---------|
| `community-design-generator.js` | 10-archetype `.pen` v2.8 document generator |
| `process-zenbin-queue.js` | Hourly queue processor (runs server-side) |
| `design-submit-page.html` | Credential-free submission form |
| `design-gallery-page.html` | Public gallery page |

## Setup

Copy `community-config.json.example` to `community-config.json` and fill in your GitHub token and repo:

```json
{
  "GITHUB_TOKEN": "ghp_...",
  "GITHUB_REPO": "owner/design-studio-queue",
  "QUEUE_FILE": "queue.json"
}
```

The token needs `repo` scope. The queue repo needs a `queue.json` file:

```json
{ "version": 1, "submissions": [], "updated_at": "" }
```

## Architecture

- **No browser credentials** — The submission form uses ZenBin's public POST API. The GitHub PAT only lives in `community-config.json` on the server running the processor.
- **Slug discovery** — Submissions use the slug format `ds-req-{base36_unix_minutes}`. The processor enumerates minute-timestamps in the lookback window to find new submissions without any shared state.
- **Registry** — Published designs are tracked in a public GitHub repo (`queue.json`). The gallery reads it via `raw.githubusercontent.com` — no auth needed.

## Live

- Submit: https://zenbin.org/p/design-submit-3
- Gallery: https://zenbin.org/p/design-gallery-2
- Queue registry: https://github.com/hyperio-mc/design-studio-queue

