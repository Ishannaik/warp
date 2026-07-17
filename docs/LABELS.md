# Issue & PR labels

The label set Warp uses to keep the issue tracker navigable — especially for newcomers hunting for a first contribution. Colors lean on the brand tokens (accent `#5360ff`, amber `#ef6a3d`) where it makes sense, and GitHub's conventional colors elsewhere.

| Label | Color | Description |
|---|---|---|
| `good first issue` | `#7057ff` | Scoped + self-contained — a great first contribution, no whole-codebase knowledge needed |
| `help wanted` | `#008672` | Maintainer would love a hand with this one |
| `bug` | `#d73a4a` | Something isn't working |
| `enhancement` | `#a2eeef` | New feature or improvement (must respect $0 / STUN-only constraints) |
| `documentation` | `#0075ca` | README, CONTRIBUTING, architecture docs, code comments |
| `accessibility` | `#d4c5f9` | Keyboard, screen reader, contrast, reduced motion |
| `performance` | `#ef6a3d` | Throughput, memory, render cost — measure before/after |
| `ui` | `#5360ff` | Visual/layout work — mobile-first (~360–430px), design tokens apply |

## Create them with `gh`

`gh label create` fails on existing labels; `--force` updates color/description in place, so the block is safe to re-run:

```bash
gh label create "good first issue" --color 7057ff --description "Scoped + self-contained — a great first contribution, no whole-codebase knowledge needed" --force
gh label create "help wanted"      --color 008672 --description "Maintainer would love a hand with this one" --force
gh label create "bug"              --color d73a4a --description "Something isn't working" --force
gh label create "enhancement"      --color a2eeef --description "New feature or improvement (must respect \$0 / STUN-only constraints)" --force
gh label create "documentation"    --color 0075ca --description "README, CONTRIBUTING, architecture docs, code comments" --force
gh label create "accessibility"    --color d4c5f9 --description "Keyboard, screen reader, contrast, reduced motion" --force
gh label create "performance"      --color ef6a3d --description "Throughput, memory, render cost — measure before/after" --force
gh label create "ui"               --color 5360ff --description "Visual/layout work — mobile-first (~360–430px), design tokens apply" --force
```

## Labeling conventions

- Every open issue should carry exactly one *type* label (`bug` / `enhancement` / `documentation`) plus any number of *area* labels (`ui`, `performance`, `accessibility`).
- Add `good first issue` only when the issue names the file(s) involved and the fix is verifiable locally in minutes — the label is a promise to newcomers.
- The issue templates auto-apply `bug` and `enhancement`.
