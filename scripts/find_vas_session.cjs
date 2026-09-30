const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\mahima\\.gemini\\antigravity-ide\\brain';
const dirs = fs.readdirSync(brainDir);

for (const d of dirs) {
  const logFile = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      if (content.includes('vasuntharalayam') || content.includes('vasthraalayam')) {
        console.log('Found in session:', d);
        const matches = content.match(/postgres(?:ql)?:\/\/[^\s"'\\<>]+/g);
        if (matches) {
          console.log('  DB strings in this session:', matches);
        }
      }
    } catch (e) {}
  }
}
