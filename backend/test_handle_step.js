const fs = require('fs');
const transcriptPath = process.env.TRANSCRIPT_PATH || '/tmp/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);

let pendingToolOutputs = [];

function handleStep(step) {
    if (step.type === 'USER_INPUT' || step.type === 'PLANNER_RESPONSE') {
        // ... simplified
        if (step.tool_calls && Array.isArray(step.tool_calls)) {
            step.tool_calls.forEach(tc => {
                pendingToolOutputs.push({textContent: 'Executing...'});
            });
        }
    } else {
        const ignoreTypes = ['USER_INPUT', 'PLANNER_RESPONSE', 'EPHEMERAL_MESSAGE', 'SYSTEM_MESSAGE', 'SYSTEM_PROMPT', 'CHECKPOINT', 'CONVERSATION_HISTORY', 'pong', 'agent_status', 'history'];
        if (step.type && !ignoreTypes.includes(step.type)) {
            if (pendingToolOutputs.length > 0) {
                const outputEl = pendingToolOutputs.shift();
                let formattedOut = step.content || JSON.stringify(step);
                try {
                    let parsed = JSON.parse(formattedOut);
                    if (parsed.output) {
                        formattedOut = parsed.output;
                    }
                } catch(e) {}
                
                if (formattedOut.includes('[diff_block_start]')) {
                    outputEl.style = 'none';
                } else {
                    outputEl.textContent = formattedOut;
                }
            }
        }
    }
}

try {
    lines.forEach((line, i) => {
        const step = JSON.parse(line);
        handleStep(step);
    });
    console.log("Success! Processed", lines.length, "lines.");
} catch(e) {
    console.error("Crash!", e);
}
