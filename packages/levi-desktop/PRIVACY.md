# Levi Desktop Privacy Policy

Effective date: 2026-08-09

This policy describes the behavior of the Levi Desktop application in this repository. It covers the standalone Electron application in `packages/levi-desktop`.

## Summary

Levi Desktop is local-first. Levi itself does not include third-party analytics telemetry, advertising trackers, or crash-report submission in the Version 1 desktop build audited for this policy.

Levi can still transmit data when you use features that contact a runtime provider, an update source, or a web page through browser automation. Those transmissions are controlled by the feature you invoke and the provider or URL you select.

## Data Levi Processes Locally

Levi processes these categories on your device:

- Workspace folder paths, file names, and selected file contents.
- Workspace summaries, search results, project rules, Git status, task output, terminal output, debugger state, and browser automation snapshots.
- Prompts, chat messages, agent planning prompts, model responses, citations, and attached workspace context.
- Runtime provider status, model lists, request status, latency, error messages, and selected runtime/model preferences.
- Recent workspace state, editor tab state, unsaved editor recovery content, chat history, agent sessions, task state, debug state, and browser screenshots.

Workspace scans exclude common generated folders and known secret or credential file patterns where those filters apply.

## Data Stored Locally

Levi stores application state under Electron's user data directory. On Windows this is normally under `%APPDATA%\Levi`.

Locally persisted data may include:

- Recent workspace selection and workspace shell settings.
- AI chat conversations and attached context.
- Coding agent sessions, plans, approval queues, and execution history.
- Runtime provider selection and last selected model.
- Task, terminal, debugger, and update state.
- Temporary browser screenshots under the Levi user data directory while browser sessions are active.
- Editor tab state and unsaved editor recovery content in renderer local storage.

Levi removes temporary browser screenshots when their browser sessions are closed. Users should treat `%APPDATA%\Levi` as application data that may contain prompts, source excerpts, and local project metadata.

## Data Sent to AI Runtime Providers

When you send an AI Chat message or request an Agent plan, Levi sends the prompt and any selected attachments to the selected runtime provider.

Supported runtime providers include local providers such as Ollama, LM Studio, llama.cpp server, and KoboldCpp, plus an OpenAI-compatible provider endpoint when explicitly configured. Local providers normally use localhost endpoints. Remote OpenAI-compatible endpoints must use HTTPS.

The data sent to a runtime provider may include:

- Your prompt.
- Conversation history needed for context.
- Selected workspace file excerpts or summaries.
- Selected terminal, task, Git, problem, or browser context.
- Model options that pass Levi's validation.

Levi does not control the privacy practices of user-selected runtime providers. If you configure a remote provider, review that provider's privacy policy and avoid sending source code or sensitive material unless you intend to transmit it to that provider.

## Credentials and Secrets

Levi does not intentionally embed API keys, signing certificates, or provider credentials in the desktop package.

Runtime endpoints may be configured through environment variables. Levi filters option names that look like API keys, tokens, secrets, or passwords from model request options, and diagnostic environment output is redacted for credential-like keys.

Do not put secrets in prompts, workspace attachments, terminal output, or browser fields unless you intend them to be processed by the selected feature and provider.

## Telemetry, Analytics, and Crash Reports

The audited Version 1 desktop build does not include third-party analytics telemetry, advertising trackers, or automatic crash-report submission.

Runtime health metrics shown inside Levi, such as request counts, failures, latency, and selected model state, are local application state.

## Updates

Levi includes update-check support through Electron Builder's updater. Update checks, downloads, and installs are user-initiated in the desktop UI. Levi does not silently restart or install updates without approval.

When update checks are used, the updater contacts the configured release provider to learn whether a newer version is available and to download update artifacts.

## Browser Automation

Levi browser automation is approval-gated. Browser screenshots and page snapshots are processed locally by Levi.

The browser may contact the URL you approve. Plain HTTP navigation is limited to localhost development servers. HTTPS navigation is allowed by the browser service. File URLs are limited to files inside the selected workspace.

Browser fill previews redact values that appear sensitive, but users should still avoid entering credentials or secrets into browser automation unless they intend to use them on the target page.

## User Control

You control:

- Which workspace folder Levi opens.
- Which files or context are attached to chat or agent prompts.
- Which runtime provider and model are used.
- Whether browser, terminal, task, Git, and file actions are approved.
- Whether update checks, downloads, or installs are started.

## Contact

Report privacy questions through the LeviCore repository issue tracker:

https://github.com/hakimbello/levicore/issues
