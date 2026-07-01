# Antigravity RC Portal

Antigravity RC Portal is a lightweight, real-time web interface for remotely controlling and monitoring an active Antigravity AI session. It allows you to chat with the agent, view its thought processes and tool executions, upload images, and even halt its execution from anywhere via a web browser.

## Features

- **Real-Time Monitoring:** Tails the Antigravity JSONL transcripts and streams updates to the frontend via WebSockets.
- **Remote Commands:** Send messages and commands directly to the agent's `tmux` session.
- **Image Support:** Attach images to your messages (up to 10MB).
- **Execution Control:** Halt a runaway agent using the built-in halt command (sends `Ctrl+C` to the `tmux` pane).
- **PWA Ready:** Install the portal as a Progressive Web App on your mobile device.
- **Theming:** Multiple built-in themes (Cyberpunk, Ocean, Matrix, Dracula, Gruvbox) and custom background support.

## Architecture

The RC Portal is split into a lightweight backend and a vanilla frontend:

- **Backend (`/backend`)**: A FastAPI Python application.
  - **Transcript Tailing**: Watches the `transcript_full.jsonl` file in the `~/.gemini/antigravity-cli/brain/` directory for the active conversation.
  - **WebSocket Server**: Broadcasts new steps and statuses to connected clients.
  - **Tmux Injection**: Uses `tmux load-buffer` and `tmux paste-buffer` to securely inject user commands back into the host's Antigravity `tmux` session without blocking.
- **Frontend (`/frontend`)**: A vanilla HTML/CSS/JS single-page application.
  - Connects to the backend via WebSocket.
  - Renders markdown and interactive elements.
  - Handles image uploads and encodes them to base64 before sending to the backend.

## Installation

### Prerequisites
- Python 3.8+
- `tmux` (required for session injection)
- An active Antigravity CLI installation.

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/antigravity-rc.git
   cd antigravity-rc
   ```
2. Install Python dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
3. Run the FastAPI server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

### Setting up the `/rc` Plugin for Antigravity

To integrate the RC Portal directly into your Antigravity chat as a slash command, you can create a custom skill.

1. Create a `SKILL.md` file at `~/.gemini/config/skills/rc/SKILL.md`.
2. Add the following content to define the `/rc` slash command:

   ```yaml
   ---
   name: rc
   description: Slash command to launch the remote control portal in the background
   ---
   ```
   ```markdown
   # Remote Control Portal Slash Command

   When the user types `/rc`, execute the following instructions to spin up their remote web portal.

   ## Execution Steps:
   1. First, check if the portal is already running in their session using `tmux list-windows | grep rc-portal`.
   2. If it is already running, just inform the user that the portal is active.
   3. If it is NOT running, start the portal as a detached background window in the current tmux session.
   4. Run the following command synchronously:
      `tmux new-window -d -n rc-portal '/home/your-username/.local/bin/rc'`
   5. Once executed, tell the user the portal is online and running hidden in the background.
   ```
*(Note: You will need a wrapper script at `/home/your-username/.local/bin/rc` that handles launching the uvicorn server and mapping the `CONVERSATION_ID` and `TMUX_SESSION` environment variables to the backend).*

## Usage

Once running, navigate to the portal in your web browser (e.g., `http://localhost:8000` or your reverse-proxied domain like `https://rc.yourdomain.com`).

- **Chat**: Type in the input box and press Enter or the send button to dispatch a message to the agent.
- **Attach Images**: Click the image icon to select and upload an image context to the agent.
- **Themes**: Click the palette icon in the top right to switch between visual themes.
