# Security Policy

## Supported Versions

Currently, only the latest `main` branch is supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability within Antigravity RC, please DO NOT create a public issue.
Instead, please send an email to the repository owner or reach out privately.

## Threat Model & Considerations

- **Tmux Injection:** The backend uses `tmux load-buffer` to inject commands. This implies that anyone who can connect to the WebSocket endpoint can run arbitrary messages through the agent, which might lead to Remote Code Execution (RCE) on the host machine if the agent complies.
- **Authentication:** By default, this app does NOT have built-in authentication. It is **highly recommended** to place the RC Portal behind an authenticating reverse proxy (like Authelia, Authentik, or Cloudflare Access) before exposing it to the open internet.
- **XSS:** The frontend uses DOMPurify to sanitize agent responses before rendering them as markdown.
