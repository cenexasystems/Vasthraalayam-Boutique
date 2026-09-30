const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\mahima\\.gemini\\antigravity-ide\\brain';
const dirs = fs.readdirSync(brainDir);
const results = new Set();

for (const d of dirs) {
  const logFile = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const matches = content.match(/postgres(?:ql)?:\/\/[^\s"'\\<>]+/g);
      if (matches) {
        matches.forEach(m => results.add(m));
      }
    } catch (e) {}
  }
}

console.log('Found connection strings:', Array.from(results));
