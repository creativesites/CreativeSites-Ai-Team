const fs = require('fs');
const path = require('path');

const coreJsonFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/package.json');
const myavanaJsonFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/myavana/package.json');

console.log('Core Package.json:', coreJsonFile);
console.log('Myavana Package.json:', myavanaJsonFile);

if (!fs.existsSync(coreJsonFile) || !fs.existsSync(myavanaJsonFile)) {
  console.error('Error: package.json files not found!');
  process.exit(1);
}

// 1. Bump Core Package Version (from 2.4.0 to 2.5.0)
let coreJson = JSON.parse(fs.readFileSync(coreJsonFile, 'utf8'));
const oldCoreVersion = coreJson.version;
coreJson.version = '2.5.0';
fs.writeFileSync(coreJsonFile, JSON.stringify(coreJson, null, 4) + '\n', 'utf8');
console.log(`✅ Bumped core package version from ${oldCoreVersion} to 2.5.0`);

// 2. Bump Myavana Package Version (from 2.0.0 to 2.1.0) and update core package dependency (from 2.4.0 to 2.5.0)
let myavanaJson = JSON.parse(fs.readFileSync(myavanaJsonFile, 'utf8'));
const oldMyavanaVersion = myavanaJson.version;
myavanaJson.version = '2.1.0';

if (myavanaJson.dependencies && myavanaJson.dependencies['myavana-bot-test-core']) {
  const oldDepVersion = myavanaJson.dependencies['myavana-bot-test-core'];
  myavanaJson.dependencies['myavana-bot-test-core'] = '2.5.0';
  console.log(`✅ Updated myavana-bot-test-core dependency version from ${oldDepVersion} to 2.5.0`);
}

fs.writeFileSync(myavanaJsonFile, JSON.stringify(myavanaJson, null, 4) + '\n', 'utf8');
console.log(`✅ Bumped myavana package version from ${oldMyavanaVersion} to 2.1.0`);
