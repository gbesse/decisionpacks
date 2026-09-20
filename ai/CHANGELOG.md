# AI changelog

This file records implementation decisions and validation.

## 2026-09-20 — Initial public alpha

- Purpose: Portable, versioned decision contracts for Jev with validated answers and policy replay.
- Native Node.js modules, no runtime dependencies, no build step.
- Synthetic fixtures and local protocol tests are distinct from live Jev evaluation.
- Added public TypeScript declarations, CLI regression cases and GitHub Actions on Node 22/24.
- Validation passed: 16 automated cases, syntax checks, no-emit declaration checks, offline demo; no build.
