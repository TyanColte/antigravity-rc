const fs = require('fs');
const transcriptPath = process.env.TRANSCRIPT_PATH || '/tmp/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);

let pending = [];
lines.forEach((line, i) => {
    try {
        const step = JSON.parse(line);
        if (step.type === 'PLANNER_RESPONSE' && step.tool_calls) {
            step.tool_calls.forEach(tc => pending.push(tc.name + " (" + step.step_index + ")"));
            console.log(`Step ${step.step_index} pushed. Queue: ${JSON.stringify(pending)}`);
        } else {
            const ignoreTypes = ['USER_INPUT', 'PLANNER_RESPONSE', 'EPHEMERAL_MESSAGE', 'SYSTEM_MESSAGE', 'SYSTEM_PROMPT', 'CHECKPOINT', 'CONVERSATION_HISTORY', 'pong', 'agent_status', 'history'];
            if (step.type && !ignoreTypes.includes(step.type)) {
                if (pending.length > 0) {
                    const popped = pending.shift();
                    console.log(`Step ${step.step_index} (${step.type}) POPPED ${popped}. Queue: ${JSON.stringify(pending)}`);
                } else {
                    console.log(`Step ${step.step_index} (${step.type}) ORPHANED.`);
                }
            }
        }
    } catch(e) {}
});
