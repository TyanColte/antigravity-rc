# Contributing to Antigravity RC

Thank you for your interest in contributing to the Antigravity RC Portal!

## How to Contribute

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally.
3. **Create a branch** for your feature or bug fix: `git checkout -b my-new-feature`
4. **Make your changes**.
5. **Test your changes** to ensure they do not break existing functionality.
6. **Commit your changes**: `git commit -am 'Add some feature'`
7. **Push to the branch**: `git push origin my-new-feature`
8. **Submit a Pull Request** against the `main` branch.

## Development Setup

- Ensure you have Python 3.8+ installed.
- To test the frontend without an active Antigravity session, you may need to mock the `transcript_full.jsonl` file or create a dummy tmux session.
- The backend relies on FastAPI and Uvicorn. Install dependencies via `pip install -r backend/requirements.txt`.

## Code Style

- **Python**: Standard PEP-8 guidelines.
- **JavaScript**: Use ES6+ syntax, keep the frontend vanilla (no heavy frameworks like React/Vue unless proposing a major rewrite).
- **CSS**: Use CSS variables and keep new themes isolated in `style.css`.
