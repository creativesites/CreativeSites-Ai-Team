const fs = require('fs');
const path = require('path');

const managerFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/smartPromptManager.js');
console.log('Target manager file:', managerFile);

if (!fs.existsSync(managerFile)) {
  console.error('Error: smartPromptManager.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(managerFile, 'utf8');

// Insert the adherence_30d personalization block at the beginning of assemblePrompt
const oldAssembleCode = `    assemblePrompt(components) {
        const {
            corePrompt,
            userInfo,
            relevantHistory,
            relevantFaqs,
            relevantProducts,
            relevantInstructions,
            allchatsSummary,
            contextAnalysis
        } = components;

        let prompt = corePrompt + '\\n\\n';`;

const newAssembleCode = `    assemblePrompt(components) {
        const {
            corePrompt,
            userInfo,
            relevantHistory,
            relevantFaqs,
            relevantProducts,
            relevantInstructions,
            allchatsSummary,
            contextAnalysis
        } = components;

        let prompt = corePrompt + '\\n\\n';

        // TASK_MSDK_007: Adherence-to-Recommendation Personalization Check
        if (userInfo) {
            let userObj = {};
            if (typeof userInfo === 'string') {
                try {
                    userObj = JSON.parse(userInfo);
                } catch {
                    userObj = {};
                }
            } else if (typeof userInfo === 'object') {
                userObj = userInfo;
            }

            if (userObj.adherence_30d !== undefined && parseFloat(userObj.adherence_30d) < 0.50) {
                const percentage = Math.round(parseFloat(userObj.adherence_30d) * 100);
                prompt += \`
🚨 [CRITICAL LIFESTYLE PERSONALIZATION RULE - TASK_MSDK_007]:
This user's 30-day routine adherence rate is currently at \${percentage}% (which is below 50%).
This indicates their current recommended wash-day frequency is too high or difficult to maintain with their current busy lifestyle.
Instead of repeating the standard generic wash-day recommendation, you MUST proactively address this low adherence:
1. Empathize warmly with their busy schedule (no guilt-tripping).
2. Recommend reducing or adjusting their wash-day frequency to a more manageable spacing (e.g. bi-weekly instead of weekly).
3. Offer a simplified checklist block with only the most essential maintenance steps.
\\n\`;
            }
        }`;

code = code.replace(oldAssembleCode, newAssembleCode);

fs.writeFileSync(managerFile, code, 'utf8');
console.log('Successfully patched smartPromptManager.js with adherence-to-recommendation checks!');
