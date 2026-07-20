# Changelog

All notable changes to the Levi VS Code extension are documented here.

## 0.6.0 — 2026-07-19

### Marketplace readiness (RC-007A)

- Bundle the Levi runtime inside the extension VSIX for self-contained installs.
- Add user-facing README, LICENSE, and privacy documentation.
- Hide developer release-check commands unless `levi.diagnostics.enabled` is on.
- Improve first-run setup guidance for Ollama and local AI models.
- Rename user-visible surfaces (`AI Models`, `Project Rules`, `Team Review`).
- Exclude tests and temporary storage from packaged VSIX.

### Prior qualification baseline

- Controlled workspace change review with explicit approval.
- Local Ollama routing with privacy-first defaults.
- RC-001 through RC-006A-06 product qualification complete.
