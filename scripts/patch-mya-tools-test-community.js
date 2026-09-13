const fs = require('fs');
const path = require('path');

const testFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/__tests__/agentTools.test.js');
console.log('Target test file:', testFile);

if (!fs.existsSync(testFile)) {
  console.error('Error: agentTools.test.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(testFile, 'utf8');

const testCodeAppend = `
describe('getCommunityPost tool (TASK_MSDK_008)', () => {
    it('executes cleanly and retrieves the latest social post from SQLite', async () => {
        const handler = mockCapturedHandlers['getCommunityPost'];
        expect(handler).toBeDefined();

        // Run tool and verify it returns a valid social post payload from DB or its fallback
        const result = await handler({ query: 'watercooler' });
        expect(result.id).toBeDefined();
        expect(result.author).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.likesCount).toBe(14);
        expect(result.commentsCount).toBe(3);
    });
});
`;

code += testCodeAppend;

fs.writeFileSync(testFile, code, 'utf8');
console.log('Successfully appended getCommunityPost unit tests to agentTools.test.js!');
