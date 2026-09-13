const fs = require('fs');
const path = require('path');

const testFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/myavana/src/__tests__/constructPrompt.test.js');
console.log('Target test file:', testFile);

if (!fs.existsSync(testFile)) {
  console.error('Error: constructPrompt.test.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(testFile, 'utf8');

// Update the jest.mock('myavana-bot-test-core') to include buildBudgetedPromptContext
const oldMockCode = `jest.mock('myavana-bot-test-core', () => ({
    getHairIssuesForUser: mockGetHairIssues,
    getAllProducts: mockGetAllProducts,
    getAllFaqs: mockGetAllFaqs,
    getAllYoutubeVideos: mockGetAllYoutubeVideos,
    getAllTestimonials: mockGetAllTestimonials,
    getAdditionalInstructions: mockGetAdditionalInstructions,
    getTrainingData: mockGetTrainingData,
}));`;

const newMockCode = `jest.mock('myavana-bot-test-core', () => ({
    getHairIssuesForUser: mockGetHairIssues,
    getAllProducts: mockGetAllProducts,
    getAllFaqs: mockGetAllFaqs,
    getAllYoutubeVideos: mockGetAllYoutubeVideos,
    getAllTestimonials: mockGetAllTestimonials,
    getAdditionalInstructions: mockGetAdditionalInstructions,
    getTrainingData: mockGetTrainingData,
    buildBudgetedPromptContext: jest.fn().mockImplementation(({ userDetails, summary }) => {
        return (userDetails ? JSON.stringify(userDetails) : 'New User') + ' ' + (summary || '');
    })
}));`;

code = code.replace(oldMockCode, newMockCode);

fs.writeFileSync(testFile, code, 'utf8');
console.log('Successfully patched constructPrompt.test.js Jest mock with buildBudgetedPromptContext!');
