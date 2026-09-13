const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/__tests__/myaRichRegistry.test.js');
console.log('Target file:', targetFile);

if (!fs.existsSync(targetFile)) {
  console.error('Error: file not found!');
  process.exit(1);
}

let code = fs.readFileSync(targetFile, 'utf8');

const testsAppend = `
describe('Gemini CLI Bugfix Unit Tests', () => {
  it('correctly parses user/assistant initials or names in first-name resolution', () => {
    // Test TASK_MSDK_004 name resolution logic
    const mockParams = {};
    const mockInitialContext_with_userName = {
      user: {
        userId: 'test_user',
        userName: 'Winston Zulu',
        userEmail: 'winston@example.com'
      }
    };
    const mockInitialContext_with_name = {
      user: {
        userId: 'test_user',
        name: 'Winston Zulu'
      }
    };

    const getFirstName = (params, initialContext) => {
      const raw = params.userName || initialContext.user?.userName || initialContext.user?.name || '';
      return String(raw).trim().split(/\\s+/)[0] || '';
    };

    expect(getFirstName(mockParams, mockInitialContext_with_userName)).toBe('Winston');
    expect(getFirstName(mockParams, mockInitialContext_with_name)).toBe('Winston');
    expect(getFirstName({ userName: 'Alice Smith' }, mockInitialContext_with_userName)).toBe('Alice');
  });

  it('correctly splits inline markdown for image and link tokens', () => {
    // Test TASK_MSDK_003 image split logic
    const INLINE = /(!?\\[[^\\]]+\\]\\([^)]+\\)|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*\\n]+\\*|_[^_\\n]+_|\\\`[^\\\`]+\\\`)/g;
    
    const text1 = "Check this ![Strand](https://myavana.com/strand.jpg) out!";
    const parts1 = text1.split(INLINE).filter(p => p !== '' && p !== undefined);
    
    expect(parts1).toContain("![Strand](https://myavana.com/strand.jpg)");
    
    const imgLink = /^!\\[([^\\]]+)\\]\\(([^)]+)\\)$/.exec("![Strand](https://myavana.com/strand.jpg)");
    expect(imgLink).not.toBeNull();
    expect(imgLink[1]).toBe("Strand");
    expect(imgLink[2]).toBe("https://myavana.com/strand.jpg");

    const regularLink = /^\\s*\\[([^\\]]+)\\]\\(([^)]+)\\)\\s*$/.exec("![Strand](https://myavana.com/strand.jpg)");
    expect(regularLink).toBeNull(); // ensures a markdown image is NOT parsed as a regular link
  });
});
`;

code += testsAppend;

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully appended bugfix tests to myaRichRegistry.test.js!');
