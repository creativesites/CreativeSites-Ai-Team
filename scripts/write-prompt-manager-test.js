const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/__tests__/smartPromptManager.test.js');
console.log('Writing test file to:', targetFile);

const testContent = `// packages/core/src/__tests__/smartPromptManager.test.js
// Dynamic unit test contract for smartPromptManager upgrades (TASK_MSDK_009, TASK_MSDK_007)

const SmartPromptManager = require('../smartPromptManager');

describe('SmartPromptManagerUpgrades', () => {
    let manager;

    beforeEach(() => {
        manager = new SmartPromptManager();
    });

    it('successfully injects the Response Format Intelligence Layer in core prompt', async () => {
        const corePrompt = await manager.getCoreSystemPrompt();
        
        expect(corePrompt).toContain('RESPONSE FORMAT INTELLIGENCE LAYER');
        expect(corePrompt).toContain('PROSE MODE');
        expect(corePrompt).toContain('STRUCTURED MODE');
        expect(corePrompt).toContain('"today_checklist" Block');
        expect(corePrompt).toContain('"routine_card" Block');
    });

    it('assembles a full prompt containing user profile, summaries and formatting constraints', () => {
        const components = {
            corePrompt: 'Core Mya prompt.',
            userInfo: { Name: 'Winston Zulu', hairType: '4C' },
            relevantHistory: [{ role: 'user', content: 'What is my hair type?' }],
            relevantFaqs: [{ question: 'What is porosity?', answer: 'Porosity is...' }],
            relevantProducts: [{ product_name: 'HairSI Kit', description: 'Porosity check', price: '$49' }],
            relevantInstructions: [{ instruction_text: 'Be warm and conversational.' }],
            allchatsSummary: 'Previous summary.',
            contextAnalysis: { topics: ['hair_type'], queryType: 'general' }
        };

        const assembled = manager.assemblePrompt(components);

        expect(assembled).toContain('Core Mya prompt.');
        expect(assembled).toContain('Winston Zulu');
        expect(assembled).toContain('Previous Conversations Summary');
        expect(assembled).toContain('Relevant MYAVANA Knowledge');
        expect(assembled).toContain('Available MYAVANA Products');
        expect(assembled).toContain('HairSI Kit');
    });

    it('successfully appends critical lifestyle personalization prompt when adherence_30d is below 50% (TASK_MSDK_007)', () => {
        const components = {
            corePrompt: 'Core Mya prompt.',
            userInfo: { Name: 'Winston Zulu', hairType: '4C', adherence_30d: 0.42 },
            relevantHistory: [],
            relevantFaqs: [],
            relevantProducts: [],
            relevantInstructions: [],
            allchatsSummary: '',
            contextAnalysis: { topics: [], queryType: 'general' }
        };

        const assembled = manager.assemblePrompt(components);

        expect(assembled).toContain('CRITICAL LIFESTYLE PERSONALIZATION RULE - TASK_MSDK_007');
        expect(assembled).toContain('42%');
        expect(assembled).toContain('bi-weekly instead of weekly');
    });
});
`;

fs.writeFileSync(targetFile, testContent, 'utf8');
console.log('Successfully wrote smartPromptManager.test.js with adherence assertions!');
