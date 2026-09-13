const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/containers/MyaChatScreen.js');
console.log('Target file:', targetFile);

if (!fs.existsSync(targetFile)) {
  console.error('Error: file not found!');
  process.exit(1);
}

let code = fs.readFileSync(targetFile, 'utf8');

// Update firstName useMemo to look for both user.userName and user.name
const oldFirstNameCode = `  const firstName = useMemo(() => {
    const raw = params.userName || initialContext.user?.name || '';
    return String(raw).trim().split(/\\s+/)[0] || '';
  }, [params.userName, initialContext]);`;

const newFirstNameCode = `  const firstName = useMemo(() => {
    const raw = params.userName || initialContext.user?.userName || initialContext.user?.name || '';
    return String(raw).trim().split(/\\s+/)[0] || '';
  }, [params.userName, initialContext]);`;

code = code.replace(oldFirstNameCode, newFirstNameCode);

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully patched MyaChatScreen.js!');
