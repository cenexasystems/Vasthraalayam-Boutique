const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\mahima\\.gemini\\antigravity-ide\\brain';
const dirs = fs.readdirSync(brainDir);

for (const d of dirs) {
  const logFile = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      if (content.includes('ep-sparkling-salad')) {
        console.log('Found in session:', d);
        // Find user requests or context
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('USER_INPUT') || line.includes('ep-sparkling-salad')) {
            const parsed = JSON.parse(line);
            if (parsed.type === 'USER_INPUT') {
              console.log('USER_INPUT:', parsed.content?.substring(0, 200));
            }
          }
        }
      }
    } catch (e) {}
  }
}
