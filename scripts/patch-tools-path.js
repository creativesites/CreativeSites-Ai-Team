const fs = require('fs');
const path = require('path');

const toolsFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/agentTools.js');
console.log('Target tools file:', toolsFile);

if (!fs.existsSync(toolsFile)) {
  console.error('Error: agentTools.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(toolsFile, 'utf8');

// Prepend path import right before DB_PATH definition
code = code.replace(
  "const DB_PATH = path.resolve(__dirname, '../../../../data/myaos.db');",
  "const path = require('path');\nconst DB_PATH = path.resolve(__dirname, '../../../../data/myaos.db');"
);

fs.writeFileSync(toolsFile, code, 'utf8');
console.log('Successfully added path import to agentTools.js!');
