document.addEventListener('DOMContentLoaded', () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws = null;
    const statusIndicator = document.querySelector('.status-indicator');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('connection-status');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    
    // Attachment elements
    const attachBtn = document.getElementById('attach-btn');
    const imageUpload = document.getElementById('image-upload');
    const attachmentPreview = document.getElementById('attachment-preview');
    const attachmentThumb = document.getElementById('attachment-thumb');
    const removeAttachmentBtn = document.getElementById('remove-attachment');
    const queuedBanner = document.getElementById('queued-banner');
    const queuedText = document.getElementById('queued-text');
    const clearQueuedBtn = document.getElementById('clear-queued-btn');
    const editQueuedBtn = document.getElementById('edit-queued-btn');
    let queuedMessage = null;
    const typingIndicator = document.getElementById('typing-indicator');
    const typingStatusText = document.getElementById('typing-status-text');
    
    let currentImageBase64 = null;
    let currentImageName = null;
    
    // Theming & Backgrounds
    const themeBtn = document.getElementById('theme-btn');
    const themeMenu = document.getElementById('theme-menu');
    const themeOptions = document.querySelectorAll('.theme-option');
    const bgBtn = document.getElementById('bg-btn');
    
    // Apply saved theme on load
    const savedTheme = localStorage.getItem('rc-theme') || '';
    if (savedTheme) document.body.className = savedTheme;
    
    // Set active state on load
    themeOptions.forEach(opt => {
        if (opt.dataset.theme === savedTheme) opt.classList.add('active');
        
        // Handle theme selection
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const newTheme = opt.dataset.theme;
            
            // Update body class
            document.body.className = newTheme;
            localStorage.setItem('rc-theme', newTheme);
            
            // Update active states
            themeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            // Close menu
            themeMenu.style.display = 'none';
        });
    });

    if (themeBtn && themeMenu) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = themeMenu.style.display === 'flex';
            themeMenu.style.display = isShowing ? 'none' : 'flex';
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!themeMenu.contains(e.target) && e.target !== themeBtn) {
                themeMenu.style.display = 'none';
            }
        });
    }

    const savedBg = localStorage.getItem('rc-bg');
    if (savedBg) {
        document.body.style.backgroundImage = `url('${savedBg}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
    }

    if (bgBtn) {
        bgBtn.addEventListener('click', () => {
            const url = prompt("Enter an image URL for the custom background (or leave blank to clear):");
            if (url !== null) {
                if (url.trim() === "") {
                    document.body.style.backgroundImage = '';
                    localStorage.removeItem('rc-bg');
                } else {
                    document.body.style.backgroundImage = `url('${url.trim()}')`;
                    document.body.style.backgroundSize = 'cover';
                    document.body.style.backgroundPosition = 'center';
                    localStorage.setItem('rc-bg', url.trim());
                }
            }
        });
    }
    
    // Queued message controls
    if (clearQueuedBtn) {
        clearQueuedBtn.addEventListener('click', () => {
            queuedMessage = null;
            queuedBanner.style.display = 'none';
        });
    }
    if (editQueuedBtn) {
        editQueuedBtn.addEventListener('click', () => {
            if (queuedMessage) {
                messageInput.value = queuedMessage.text;
                queuedMessage = null;
                queuedBanner.style.display = 'none';
                messageInput.focus();
            }
        });
    }

    let isAgentBusy = false;
    let isRecording = false;
    let lastTmuxStatus = 'IDLE';
    let idleTimer = null;

    function checkIdleState() {
        if (idleTimer) clearTimeout(idleTimer);
        
        // We only go truly idle if both the tmux pane says IDLE AND all known tool calls are fully rendered
        if (lastTmuxStatus === 'IDLE' && pendingToolOutputs.length === 0) {
            // Add a 1.5 second debounce. If the agent is just switching tools, 
            // a new status will arrive and clear this timer before it fires.
            idleTimer = setTimeout(() => {
                typingIndicator.style.display = 'none';
                isAgentBusy = false;
                updateSendButtonState();
                // Flush queued message if one exists
                if (queuedMessage) {
                    const q = queuedMessage;
                    queuedMessage = null;
                    queuedBanner.style.display = 'none';
                    messageInput.value = q.text;
                    if (q.imageData) {
                        currentImageBase64 = q.imageData;
                        currentImageName = q.imageName;
                    }
                    sendMessage();
                }
            }, 1500);
        }
    }

    function updateSendButtonState() {
        if (isAgentBusy) {
            sendBtn.innerHTML = '<span class="material-symbols-rounded">stop_circle</span>';
            sendBtn.style.color = 'var(--danger)';
            messageInput.placeholder = 'Type to queue a message...';
            sendBtn.classList.remove('recording');
        } else {
            sendBtn.style.color = '';
            messageInput.placeholder = 'Message Antigravity...';
            if (isRecording) {
                sendBtn.innerHTML = '<span class="material-symbols-rounded">mic</span>';
                sendBtn.classList.add('recording');
            } else if (messageInput.value.trim().length > 0 || currentImageBase64) {
                sendBtn.innerHTML = '<span class="material-symbols-rounded">send</span>';
                sendBtn.classList.remove('recording');
            } else {
                sendBtn.innerHTML = '<span class="material-symbols-rounded">mic</span>';
                sendBtn.classList.remove('recording');
            }
        }
    }

    let recognition = null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = function() {
            isRecording = true;
            updateSendButtonState();
        };

        recognition.onresult = function(event) {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            messageInput.value = finalTranscript || interimTranscript;
            messageInput.dispatchEvent(new Event('input'));
        };

        recognition.onerror = function(event) {
            console.error("Speech recognition error", event.error);
            isRecording = false;
            updateSendButtonState();
        };

        recognition.onend = function() {
            isRecording = false;
            updateSendButtonState();
        };
    }

    let isHolding = false;

    function startHold() {
        if (isAgentBusy || !recognition) return;
        if (messageInput.value.trim().length > 0 || currentImageBase64) return; // Send mode
        isHolding = true;
        if (!isRecording) {
            messageInput.value = '';
            recognition.start();
        }
    }

    function endHold(e) {
        if (!isHolding) return;
        isHolding = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (e) {
                // Ignore if it wasn't started yet
            }
        }
    }

    // Touch events for mobile hold-to-talk
    sendBtn.addEventListener('touchstart', (e) => {
        if (isAgentBusy) {
            e.preventDefault();
            triggerHalt();
            return;
        }
        if (messageInput.value.trim().length > 0 || currentImageBase64) {
            return; // let it be handled by click
        }
        e.preventDefault();
        startHold();
    });

    sendBtn.addEventListener('touchend', (e) => {
        if (isHolding) {
            e.preventDefault();
            endHold(e);
        }
    });

    sendBtn.addEventListener('touchcancel', (e) => {
        endHold(e);
    });

    // Mouse events for desktop hold-to-talk
    sendBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (isAgentBusy) {
            triggerHalt();
            return;
        }
        if (messageInput.value.trim().length > 0 || currentImageBase64) {
            return;
        }
        startHold();
    });

    sendBtn.addEventListener('mouseup', (e) => {
        endHold(e);
    });
    
    sendBtn.addEventListener('mouseleave', (e) => {
        endHold(e);
    });

    sendBtn.addEventListener('click', (e) => {
        if (isAgentBusy) return; // handled by mousedown/touchstart
        if (messageInput.value.trim().length > 0 || currentImageBase64) {
            sendMessage();
        }
    });

    function triggerHalt() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({type: "halt"}));
        
        const haltStep = {
            type: 'PLANNER_RESPONSE',
            source: 'AGENT',
            content: '🛑 **Execution halted.** Antigravity has stopped and is waiting for your next instruction.',
            tool_calls: []
        };
        handleStep(haltStep);
        scrollToBottom();
    }

    // Wire the Escape key to the Halt action
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            triggerHalt();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.value === '') this.style.height = 'auto';
        updateSendButtonState();
    });

    const recentSends = new Map();
    const pendingToolOutputs = [];
    
    // Command history
    const sentHistory = [];
    let historyIndex = -1;
    let pendingCurrentInput = '';

    function cleanUserContent(content) {
        if (!content) return '';
        let clean = content.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '');
        clean = clean.replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/g, '$1');
        return clean.trim();
    }
    
    function getDedupKey(content) {
        return content.replace(/\[Attached Image:.*?\]/g, '').trim();
    }
    
    // Enter to send (Shift+Enter for newline)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        } else if (e.key === 'ArrowUp') {
            if (queuedMessage) {
                e.preventDefault();
                messageInput.value = queuedMessage.text;
                queuedMessage = null;
                queuedBanner.style.display = 'none';
                messageInput.dispatchEvent(new Event('input'));
            } else if (sentHistory.length > 0) {
                if (historyIndex === -1) {
                    pendingCurrentInput = messageInput.value;
                    historyIndex = sentHistory.length - 1;
                } else if (historyIndex > 0) {
                    historyIndex--;
                }
                messageInput.value = sentHistory[historyIndex];
                messageInput.dispatchEvent(new Event('input')); // auto-resize
            }
        } else if (e.key === 'ArrowDown') {
            if (historyIndex !== -1) {
                if (historyIndex < sentHistory.length - 1) {
                    historyIndex++;
                    messageInput.value = sentHistory[historyIndex];
                } else {
                    historyIndex = -1;
                    messageInput.value = pendingCurrentInput;
                }
                messageInput.dispatchEvent(new Event('input'));
            }
        }
    });

    // Removed old button listeners

    // Image Attachment Logic
    attachBtn.addEventListener('click', () => {
        imageUpload.click();
    });

    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageBase64 = event.target.result;
            currentImageName = file.name;
            attachmentThumb.src = currentImageBase64;
            attachmentPreview.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    });

    // Clipboard Paste Image Support
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (event) => {
                    currentImageBase64 = event.target.result;
                    // File name from paste might be generic, so provide a fallback
                    currentImageName = file.name || 'pasted_image.png';
                    attachmentThumb.src = currentImageBase64;
                    attachmentPreview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
                
                // Prevent the image file from being handled weirdly by the browser
                e.preventDefault();
                break; // Only handle one pasted image at a time
            }
        }
    });

    removeAttachmentBtn.addEventListener('click', () => {
        clearAttachment();
    });

    function clearAttachment() {
        currentImageBase64 = null;
        currentImageName = null;
        imageUpload.value = '';
        attachmentPreview.style.display = 'none';
        attachmentThumb.src = '';
    }

    // WebSocket events
    let pingInterval;
    let missedPongs = 0;

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        statusDot.className = 'status-dot';
        statusText.textContent = 'Connecting...';
        
        ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

        ws.onopen = () => {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected';
            missedPongs = 0;
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (document.visibilityState === 'hidden') return;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({type: 'ping'}));
                    missedPongs++;
                    if (missedPongs > 2) {
                        ws.close();
                    }
                }
            }, 5000);
        };

        ws.onclose = () => {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Disconnected (Click to Reconnect)';
            if (pingInterval) clearInterval(pingInterval);
            
            isAgentBusy = false;
            updateSendButtonState();
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
                typingStatusText.textContent = '';
            }
        };
        
        ws.onerror = () => {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Error (Click to Reconnect)';
            if (pingInterval) clearInterval(pingInterval);
        };

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                console.error("Invalid JSON payload received:", e);
                return;
            }
        
        // Handle different message types from the transcript
        if (data.type === 'pong') {
            missedPongs = 0;
            return;
        } else if (data.type === 'history' && Array.isArray(data.messages)) {
            messagesContainer.innerHTML = ''; // clear
            pendingToolOutputs.length = 0;
            data.messages.forEach(step => {
                handleStep(step);
            });
            scrollToBottom(true);
        } else if (data.message_type === 'step') {
            handleStep(data);
            scrollToBottom();
        } else if (data.type === 'agent_status') {
            lastTmuxStatus = data.status;
            if (data.status === 'IDLE') {
                checkIdleState();
            } else if (data.status) {
                if (idleTimer) clearTimeout(idleTimer);
                typingStatusText.textContent = data.status;
                typingIndicator.style.display = 'flex';
                isAgentBusy = true;
                updateSendButtonState();
                scrollToBottom();
            } else {
                typingStatusText.textContent = '';
            }
        }
    };
}
    
    function handleStep(step) {
        if (step.type === 'USER_INPUT' || step.type === 'PLANNER_RESPONSE') {
            if (step.type === 'USER_INPUT') {
                step.content = cleanUserContent(step.content);
                const dedupKey = getDedupKey(step.content);
                const count = recentSends.get(dedupKey) || 0;
                if (count > 0) {
                    if (count === 1) recentSends.delete(dedupKey);
                    else recentSends.set(dedupKey, count - 1);
                    return;
                }
            } else if (step.type === 'PLANNER_RESPONSE') {
                if (pendingToolOutputs.length > 0) {
                    console.warn(`Flushing ${pendingToolOutputs.length} orphaned tool outputs from previous turn.`);
                    pendingToolOutputs.length = 0;
                }
                if (!step.tool_calls || step.tool_calls.length === 0) {
                    checkIdleState();
                } else {
                    if (idleTimer) clearTimeout(idleTimer);
                    // Re-assert busy state — prevents tmux poller IDLE flicker
                    isAgentBusy = true;
                    updateSendButtonState();
                }
            }
            // For unified appendMessage, ensure source is mapped
            step.source = (step.type === 'USER_INPUT') ? 'USER' : 'AGENT';
            appendMessage(step);
        } else {
            const ignoreTypes = ['USER_INPUT', 'PLANNER_RESPONSE', 'EPHEMERAL_MESSAGE', 'SYSTEM_MESSAGE', 'SYSTEM_PROMPT', 'CHECKPOINT', 'CONVERSATION_HISTORY', 'pong', 'agent_status', 'history'];
            if (step.type && !ignoreTypes.includes(step.type)) {
                if (pendingToolOutputs.length > 0) {
                    let outputEl;
                    if (step.type === 'ERROR_MESSAGE') {
                        outputEl = pendingToolOutputs.shift().el;
                    } else {
                        let matchIndex = pendingToolOutputs.findIndex(p => p.expectedType === step.type || p.expectedType === 'UNKNOWN');
                        if (matchIndex !== -1) {
                            outputEl = pendingToolOutputs.splice(matchIndex, 1)[0].el;
                        } else {
                            console.warn(`Orphaned tool output of type ${step.type} ignored. Queue intact.`);
                            return; // Stop processing to prevent assigning to wrong element
                        }
                    }

                    let formattedOut = step.content || JSON.stringify(step);
                    try {
                        let parsed = JSON.parse(formattedOut);
                        if (parsed.output) {
                            formattedOut = parsed.output;
                        }
                    } catch(e) {}
                    
                    if (formattedOut.includes('[diff_block_start]')) {
                        outputEl.style.display = 'none';
                    } else {
                        outputEl.textContent = formattedOut;
                    }
                    
                    if (pendingToolOutputs.length === 0) {
                        checkIdleState();
                    }
                }
            }
        }
    }

    connectWebSocket();
    
    if (statusIndicator) {
        statusIndicator.style.cursor = 'pointer';
        statusIndicator.title = 'Click to reconnect';
        statusIndicator.addEventListener('click', () => {
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
            
            statusDot.className = 'status-dot';
            statusText.textContent = 'Reloading...';
            window.location.reload();
        });
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text && !currentImageBase64) return;
        
        // If agent is busy, queue the message instead of sending
        if (isAgentBusy) {
            if (queuedMessage) {
                queuedMessage.text += '\n' + text;
                if (!queuedMessage.imageData && currentImageBase64) {
                    queuedMessage.imageData = currentImageBase64;
                    queuedMessage.imageName = currentImageName;
                }
            } else {
                queuedMessage = { text, imageData: currentImageBase64, imageName: currentImageName };
            }
            queuedBanner.style.display = 'block';
            queuedText.textContent = queuedMessage.text;
            messageInput.value = '';
            messageInput.style.height = 'auto';
            clearAttachment();
            return;
        }
        
        let displayContent = text;
        if (currentImageBase64) {
            displayContent = `[Attached Image: ${currentImageName}]\n${text}`;
        }
        
        // Optimistically show user message
        appendMessage({ source: 'USER', content: displayContent });
        recentSends.set(text, (recentSends.get(text) || 0) + 1); // the dedup key is just the text they typed
        
        if (text) {
            sentHistory.push(text);
            if (sentHistory.length > 100) sentHistory.shift();
        }
        historyIndex = -1;
        pendingCurrentInput = '';
        
        const payload = { 
            type: 'command', 
            text: text 
        };
        
        if (currentImageBase64) {
            payload.image_data = currentImageBase64;
            payload.image_name = currentImageName;
        }
        
        // Show typing indicator
        typingStatusText.textContent = 'Thinking...';
        typingIndicator.style.display = 'flex';
        scrollToBottom(true);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert("Not connected. Please click the status indicator at the top to reconnect.");
            return;
        }
        
        ws.send(JSON.stringify(payload));
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
        clearAttachment();
        scrollToBottom(true);
    }

    function appendMessage(msg) {
        if (!msg.content && !msg.thinking && (!msg.tool_calls || msg.tool_calls.length === 0)) return;

        if (msg.step_index !== undefined) {
            if (document.getElementById(`step-${msg.step_index}`)) {
                return; // Prevent duplicate rendering
            }
            if (document.querySelector(`[data-merged-steps~="${msg.step_index}"]`)) {
                return;
            }
        }

        const msgDiv = document.createElement('div');
        if (msg.step_index !== undefined) {
            msgDiv.id = `step-${msg.step_index}`;
        }
        msgDiv.className = `message ${msg.source === 'USER' ? 'msg-user' : 'msg-agent'}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        let innerHTML = '';
        
        // We no longer render msg.thinking because it only contains system-generated boilerplate summaries in the transcript.
        
        if (msg.content) {
            let parsed = marked.parse(msg.content);
            if (typeof DOMPurify !== 'undefined') {
                parsed = DOMPurify.sanitize(parsed);
                innerHTML += parsed;
            } else {
                console.error("DOMPurify not loaded! Refusing to render potentially unsafe HTML.");
                // Fallback to safe plain text rendering
                const safeTextNode = document.createElement('div');
                safeTextNode.textContent = msg.content;
                innerHTML += safeTextNode.outerHTML;
            }
        }
        
        bubble.innerHTML = innerHTML;
        



        // Handle tool calls
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            const typeMapping = {
                'run_command': { type: 'RUN_COMMAND', icon: '>_', label: 'Command' },
                'view_file': { type: 'VIEW_FILE', icon: '👁', label: 'View' },
                'read_url_content': { type: 'READ_URL_CONTENT', icon: '🌐', label: 'URL Read' },
                'multi_replace_file_content': { type: 'CODE_ACTION', icon: '📝', label: 'Edit' },
                'replace_file_content': { type: 'CODE_ACTION', icon: '📝', label: 'Edit' },
                'write_to_file': { type: 'CODE_ACTION', icon: '📝', label: 'Edit' },
                'grep_search': { type: 'GREP_SEARCH', icon: '🔍', label: 'Search' },
                'list_dir': { type: 'LIST_DIRECTORY', icon: '📁', label: 'Directory List' },
                'search_web': { type: 'SEARCH_WEB', icon: '🔍', label: 'Web Search' },
                'call_mcp_tool': { type: 'MCP_TOOL', icon: '🔌', label: 'MCP Call' },
                'ask_question': { type: 'ASK_QUESTION', icon: '❓', label: 'Question' },
                'generate_image': { type: 'GENERATE_IMAGE', icon: '🎨', label: 'Image Generation' }
            };

            function updateGroupSummary(groupBlock) {
                const instances = groupBlock.querySelectorAll('.tool-instance');
                const counts = {};
                instances.forEach(inst => {
                    let t = inst.dataset.type || 'UNKNOWN';
                    counts[t] = (counts[t] || 0) + 1;
                });
                
                const parts = [];
                if (counts['RUN_COMMAND']) parts.push(`>_ ${counts['RUN_COMMAND']} Command${counts['RUN_COMMAND']>1?'s':''}`);
                if (counts['CODE_ACTION']) parts.push(`📝 ${counts['CODE_ACTION']} Edit${counts['CODE_ACTION']>1?'s':''}`);
                if (counts['VIEW_FILE']) parts.push(`👁 ${counts['VIEW_FILE']} View${counts['VIEW_FILE']>1?'s':''}`);
                if (counts['GREP_SEARCH']) parts.push(`🔍 ${counts['GREP_SEARCH']} Search${counts['GREP_SEARCH']>1?'es':''}`);
                if (counts['LIST_DIRECTORY']) parts.push(`📁 ${counts['LIST_DIRECTORY']} Directory List${counts['LIST_DIRECTORY']>1?'s':''}`);
                
                let otherCount = 0;
                for (let k in counts) {
                    if (!['RUN_COMMAND', 'CODE_ACTION', 'VIEW_FILE', 'GREP_SEARCH', 'LIST_DIRECTORY'].includes(k)) {
                        otherCount += counts[k];
                    }
                }
                if (otherCount > 0) parts.push(`🛠 ${otherCount} Tool${otherCount>1?'s':''}`);
                
                const summary = groupBlock.querySelector('summary');
                if (summary) {
                    summary.textContent = parts.join(', ');
                }
            }

            function buildToolInstance(tc, isFirstInBlock) {
                let baseName = tc.name;
                if (baseName.startsWith('default_api:')) baseName = baseName.substring(12);
                let meta = typeMapping[baseName] || { type: 'UNKNOWN', icon: '🛠', label: 'Tool Call' };
                
                const toolInner = document.createElement('div');
                toolInner.className = 'tool-instance';
                toolInner.dataset.type = meta.type;
                if (!isFirstInBlock) {
                    toolInner.style.marginTop = '10px';
                    toolInner.style.borderTop = '1px solid rgba(255,255,255,0.1)';
                    toolInner.style.paddingTop = '10px';
                }
                
                const argsEl = document.createElement('pre');
                argsEl.className = 'tool-args';
                
                let parsedArgs = {};
                if (tc.args) {
                    for (let key in tc.args) {
                        try { parsedArgs[key] = JSON.parse(tc.args[key]); }
                        catch (e) { parsedArgs[key] = tc.args[key]; }
                    }
                }

                if (baseName === 'run_command') {
                    argsEl.textContent = parsedArgs.CommandLine || parsedArgs.command || JSON.stringify(parsedArgs, null, 2);
                } else if (baseName === 'multi_replace_file_content' || baseName === 'replace_file_content') {
                    const esc = (s) => { let span = document.createElement('span'); span.textContent = s; return span.innerHTML; };
                    let html = `<strong>Target File:</strong> ${esc(parsedArgs.TargetFile || '')}\n`;
                    if (parsedArgs.Instruction) html += `<strong>Instruction:</strong> ${esc(parsedArgs.Instruction)}\n`;
                    if (parsedArgs.Description) html += `<strong>Description:</strong> ${esc(parsedArgs.Description)}\n\n`;
                    const formatDiff = (target, replacement) => {
                        const oldLines = (target||'').split('\n').map(l => `<div class="diff-minus">- ${esc(l)}</div>`).join('');
                        const newLines = (replacement||'').split('\n').map(l => `<div class="diff-plus">+ ${esc(l)}</div>`).join('');
                        return `<div class="diff-block">${oldLines}${newLines}</div>\n`;
                    };
                    if (parsedArgs.ReplacementChunks && Array.isArray(parsedArgs.ReplacementChunks)) {
                        parsedArgs.ReplacementChunks.forEach((chunk, i) => {
                            html += `<strong>--- Chunk ${i+1} (Lines ${chunk.StartLine}-${chunk.EndLine}) ---</strong>\n`;
                            html += formatDiff(chunk.TargetContent, chunk.ReplacementContent);
                        });
                    } else if (parsedArgs.TargetContent) {
                        html += `<strong>--- Lines ${parsedArgs.StartLine}-${parsedArgs.EndLine} ---</strong>\n`;
                        html += formatDiff(parsedArgs.TargetContent, parsedArgs.ReplacementContent);
                    }
                    argsEl.innerHTML = html || "Editing file...";
                } else if (baseName === 'write_to_file') {
                    argsEl.textContent = `Writing new content to ${parsedArgs.TargetFile || ''}`;
                } else if (baseName === 'view_file') {
                    let text = `Viewing ${parsedArgs.AbsolutePath || ''}`;
                    if (parsedArgs.StartLine && parsedArgs.EndLine) text += ` (Lines ${parsedArgs.StartLine}-${parsedArgs.EndLine})`;
                    argsEl.textContent = text;
                } else if (baseName === 'list_dir') {
                    argsEl.textContent = `Listing directory: ${parsedArgs.DirectoryPath || ''}`;
                } else if (baseName === 'grep_search') {
                    argsEl.textContent = `Searching for "${parsedArgs.Query || ''}" in ${parsedArgs.SearchPath || ''}`;
                } else {
                    argsEl.textContent = JSON.stringify(parsedArgs, null, 2);
                }
                
                const outEl = document.createElement('pre');
                outEl.className = 'tool-output';
                outEl.textContent = 'Executing...';
                
                toolInner.appendChild(argsEl);
                toolInner.appendChild(outEl);
                
                return { element: toolInner, outEl: outEl, expectedType: meta.type };
            }

            let fullyMerged = false;

            // Attempt to merge into previous message if there's no new text content
            if (!msg.content && msg.source !== 'USER') {
                const lastMsg = messagesContainer.lastElementChild;
                if (lastMsg && lastMsg.classList.contains('msg-agent')) {
                    const lastBubble = lastMsg.querySelector('.msg-bubble');
                    if (lastBubble) {
                        const lastGroup = lastBubble.lastElementChild;
                        if (lastGroup && lastGroup.classList.contains('tool-call-block')) {
                            // Merge all tools into this group block
                            msg.tool_calls.forEach(tc => {
                                const buildRes = buildToolInstance(tc, false);
                                lastGroup.appendChild(buildRes.element);
                                pendingToolOutputs.push({ el: buildRes.outEl, expectedType: buildRes.expectedType });
                            });
                            
                            updateGroupSummary(lastGroup);
                            
                            if (msg.step_index !== undefined) {
                                let mergedSteps = lastGroup.dataset.mergedSteps || "";
                                lastGroup.dataset.mergedSteps = mergedSteps + " " + msg.step_index;
                            }
                            
                            fullyMerged = true;
                        }
                    }
                }
            }

            if (!fullyMerged) {
                const groupBlock = document.createElement('details');
                groupBlock.className = 'tool-call-block'; 
                
                const groupSummary = document.createElement('summary');
                groupBlock.appendChild(groupSummary);
                
                msg.tool_calls.forEach((tc, idx) => {
                    const buildRes = buildToolInstance(tc, idx === 0);
                    groupBlock.appendChild(buildRes.element);
                    pendingToolOutputs.push({ el: buildRes.outEl, expectedType: buildRes.expectedType });
                });
                
                updateGroupSummary(groupBlock);
                bubble.appendChild(groupBlock);
                
                msgDiv.appendChild(bubble);
                messagesContainer.appendChild(msgDiv);
            }
        } else {
            msgDiv.appendChild(bubble);
            messagesContainer.appendChild(msgDiv);
        }
    }

    const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
    const scrollContainer = messagesContainer.parentElement;
    let isAutoScrolling = true;

    // Monitor scroll position to hide button if user scrolls down manually, and to track state
    scrollContainer.addEventListener('scroll', () => {
        const threshold = 100;
        if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - threshold) {
            isAutoScrolling = true;
            scrollToBottomBtn.style.display = 'none';
        } else {
            // User scrolled up!
            isAutoScrolling = false;
        }
    });

    scrollToBottomBtn.addEventListener('click', () => {
        isAutoScrolling = true;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        scrollToBottomBtn.style.display = 'none';
    });

    function scrollToBottom(force = false) {
        if (force || isAutoScrolling) {
            // We use setTimeout to ensure the browser has computed layout before scrolling
            setTimeout(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                scrollToBottomBtn.style.display = 'none';
            }, 50);
        } else {
            // User has scrolled up, show the button instead of forcing scroll
            scrollToBottomBtn.style.display = 'flex';
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

});
