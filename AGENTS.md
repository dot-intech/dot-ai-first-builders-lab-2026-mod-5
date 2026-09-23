# AGENTS.md — project context

> **DAW template.** Fill in the `[...]` with what is true of YOUR project and delete what does not
> apply. This file describes **the project**; **the process** is DAW's job (phases, gates, when to
> test, when to commit). Do not mix the two: process rules written here compete with the pipeline's.
>
> It is **tool-agnostic on purpose**: Claude Code reads it through the import in `CLAUDE.md`, Codex
> CLI, Copilot CLI, Cursor and OpenCode read it directly, and Gemini CLI gets it through
> `GEMINI.md`. The same file serves whichever tool you open the repo with — which is the point:
> porting the pipeline to another tool must not mean rewriting what your project is.

---

## Language

**Always respond in the language the user writes in.** Write every artifact you produce — PRDs,
specs, ADRs, reports, commit messages, status lines — in that same language, regardless of the
language these instructions are written in.

If this project has a fixed working language, state it here and use it instead:

> Working language: `Spanish — write all artifacts in Spanish`

---

## What this project is

Esta es una aplicación web que nos permite registrar lo que comemos a partir de una foto del plato utilizando inteligencia artificial. Se encarga de identificar, describir y analizar los alimentos y bebidas en la foto, permitiendo guardar un registro de lo que consumimos y las calorias y desglose nutricional asociados al consumo.

**Reference PRD:** `docs/daw/prd/PRD.md`

---

## Stack

**This is the only place the stack lives.** DAW reads it from here and generates no derived file.
Fill it in even if the repo is empty: without a stack there is nothing to plan or implement against.

If the repo already has code and this section is empty, DAW will detect the stack from your config
files and **propose the text for you to paste here**. You always confirm it.

| Field | Value |
|-------|-------|
| Language | TypeScript 5.x |
| Runtime | Node 20 |
| Framework | Next.js 15 |
| Database | PostgreSQL |
| Test runner | Vitest |
| Linter / formatter | ESLint + Prettier |
| Package manager | pnpm |
| Google AI Studio library | genai |
| Google AI Studio Vision Model | gemini-3.1-flash-lite |
| Install command | pnpm install --frozen-lockfile |
| Test command | pnpm test:unit (unit) · pnpm test:integration (requiere DB) |
| Lint command | pnpm lint |
| Typecheck command | pnpm exec tsc --noEmit |

---

## Architecture conventions

**DAW validates your code against this section** during the CODE phase, via `daw-validate-arch`.
Leave it empty and that validation has nothing to compare against, so it stops being worth running.

- **Folder structure:** `src/features/<feature>/` with `ui`, `domain`, `data`
- **Layer separation:** the UI never talks to the database; always through a service
- **Error handling:** typed errors; never a silent catch
- **Naming:** files in kebab-case, components in PascalCase
- **Dependencies:** no new libraries without justifying them in the spec

---

## Code conventions

- No `any`. If it is unavoidable, it comes with a comment explaining why.
- Pure functions wherever possible; side effects at the edges.
- Comments only when the *why* is not obvious from the code.

---

## What NOT to do in this project

This section is worth its weight in gold: it is where the scars go, the things that already went
wrong once.

- Do not touch `config/` without asking.
- Never call APIs that have a cost associated (payments, tokens, etc) in tests — there is a mock.
- No destructive migrations.

---

## Domain glossary

The terms specific to your product, so the agent uses them correctly instead of inventing synonyms.

- **Consumo:** El conjunto de alimentos y/o bebidas que el usuario fotografió para analizar y registrar en la aplicación

---

> ℹ️ **What does NOT belong in this file, because DAW provides it:** the order work happens in, when
> the spec gets written, when tests run, when to commit, what it takes to move between phases. All
> of that lives in `.daw/` and applies on its own.

<!-- BEGIN DAW (managed by DAW — do not edit by hand) -->
# DAW — Dilux Agentic Workflow

This repo uses **DAW**: an agent-driven development pipeline with the phases
`CLASSIFY → DEFINE → PLAN → CODE → VERIFY → RELEASE`.

Before answering, read `.daw/orchestrator.md` and run its Boot Sequence. It is a strict state
machine: it decides what you are allowed to do based on the phase recorded in `.daw-state.json`.

The project's own context — stack, architecture, domain — is elsewhere in this file. It lives here,
in `AGENTS.md`, and not in any one tool's file, on purpose: it is tool-agnostic and comes along
unchanged when the pipeline is ported to another agent.
<!-- END DAW -->
