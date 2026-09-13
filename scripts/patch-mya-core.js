const fs = require('fs');
const path = require('path');

const bridgeFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/services/mya/MyAvanaMobileHostBridge.js');
const promptManagerFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/smartPromptManager.js');

console.log('Bridge file:', bridgeFile);
console.log('Prompt manager file:', promptManagerFile);

if (!fs.existsSync(bridgeFile)) {
  console.error('Error: MyAvanaMobileHostBridge.js not found!');
  process.exit(1);
}

if (!fs.existsSync(promptManagerFile)) {
  console.error('Error: smartPromptManager.js not found!');
  process.exit(1);
}

// ==========================================
// 1. PATCH MYAVANA MOBILE HOST BRIDGE (006)
// ==========================================
let bridgeCode = fs.readFileSync(bridgeFile, 'utf8');

// Add recentActions history array and recordAction helper
const oldRecentActionsVar = `let currentNavigationRef = null;
let currentActiveRoute = 'Dashboard';`;

const newRecentActionsVar = `let currentNavigationRef = null;
let currentActiveRoute = 'Dashboard';

const recentActions = [];

function recordAction(action) {
  if (!action) return;
  // Standardize naming
  const cleanAction = String(action).toLowerCase().trim().replace(/\\s+/g, '_');
  if (recentActions.includes(cleanAction)) {
    // Move to end if already present
    const idx = recentActions.indexOf(cleanAction);
    recentActions.splice(idx, 1);
  }
  recentActions.push(cleanAction);
  if (recentActions.length > 5) {
    recentActions.shift(); // Keep only last 5 actions as expected by ExperienceContextService
  }
}`;

bridgeCode = bridgeCode.replace(oldRecentActionsVar, newRecentActionsVar);

// Update syncRoute to record active route tracking action
const oldSyncRoute = `  syncRoute(routeName, routeParams = {}) {
    if (!routeName) return;
    currentActiveRoute = routeName;
    const screenTitle = this.getScreenTitle(routeName);
    const screenContext = {
      surface: 'myavana_mobile_app',
      screen: routeName,
      title: screenTitle,
      params: routeParams,
    };
    return screenContext;
  },`;

const newSyncRoute = `  syncRoute(routeName, routeParams = {}) {
    if (!routeName) return;
    currentActiveRoute = routeName;
    const screenTitle = this.getScreenTitle(routeName);
    const screenContext = {
      surface: 'myavana_mobile_app',
      screen: routeName,
      title: screenTitle,
      params: routeParams,
    };
    // Audit context action logging (TASK_MSDK_006)
    recordAction('viewed_' + routeName);
    return screenContext;
  },`;

bridgeCode = bridgeCode.replace(oldSyncRoute, newSyncRoute);

// Update handleHostAction to record dynamic tool actions
const oldHandleHostAction = `  handleHostAction(action, payload = {}, navigation = null) {
    const nav = navigation || currentNavigationRef;
    if (!nav) {
      console.warn('[HostBridge] No navigation context available to handle action:', action);
      return false;
    }

    const actionType = typeof action === 'string' ? action : action?.type || action?.action;`;

const newHandleHostAction = `  handleHostAction(action, payload = {}, navigation = null) {
    const nav = navigation || currentNavigationRef;
    if (!nav) {
      console.warn('[HostBridge] No navigation context available to handle action:', action);
      return false;
    }

    const actionType = typeof action === 'string' ? action : action?.type || action?.action;
    // Audit context action logging (TASK_MSDK_006)
    if (actionType) {
      recordAction('triggered_' + actionType);
    }`;

bridgeCode = bridgeCode.replace(oldHandleHostAction, newHandleHostAction);

// Update getAppContext to explicitly forward the audited top-level fields
const oldGetAppContext = `    const activeScreen = extraContext.screen || currentActiveRoute || 'MyaChatScreen';

    const firstName = String(userName || '').trim().split(/\\s+/)[0] || null;

    return {
      surface: 'myavana_mobile_app',
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      clientVersion: '2.2.4',
      screen: activeScreen,
      screenTitle: this.getScreenTitle(activeScreen),

      // Flat fields the server's ExperienceContextService actually reads.
      //
      // It normalises \`rawContext.userName\`, \`rawContext.firstName\` and
      // \`rawContext.page\` from the TOP level. We were sending the name only
      // nested under \`user\`, and the screen only as \`screen\`, so
      // norm.userName came back null every time - which meant the prompt never
      // got "User: <name>" and never got the "Address <name> by name" hint.
      // That is why Mya kept asking authenticated users what to call them.
      //
      // The nested \`user\` object is kept for anything else that reads it; this
      // adds the shape the server expects rather than replacing anything.
      userName: userName || null,
      firstName,
      page: this.getScreenTitle(activeScreen),
      screenContext: {
        surface: 'myavana_mobile_app',
        screen: activeScreen,
        title: this.getScreenTitle(activeScreen),
      },`;

const newGetAppContext = `    const activeScreen = extraContext.screen || currentActiveRoute || 'MyaChatScreen';

    const firstName = String(userName || '').trim().split(/\\s+/)[0] || null;

    return {
      surface: 'myavana_mobile_app',
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      clientVersion: '2.2.4',
      screen: activeScreen,
      screenTitle: this.getScreenTitle(activeScreen),

      // Flat fields the server's ExperienceContextService actually reads (TASK_MSDK_006 Context Pipeline Audit).
      entity: extraContext.entity || null,
      state: extraContext.state || null,
      userName: userName || null,
      firstName,
      page: this.getScreenTitle(activeScreen),
      streak: extraContext.streak || null,
      recentActions: extraContext.recentActions || recentActions,

      screenContext: {
        surface: 'myavana_mobile_app',
        screen: activeScreen,
        title: this.getScreenTitle(activeScreen),
      },`;

bridgeCode = bridgeCode.replace(oldGetAppContext, newGetAppContext);

fs.writeFileSync(bridgeFile, bridgeCode, 'utf8');
console.log('✅ Successfully patched MyAvanaMobileHostBridge.js!');

// ==========================================
// 2. PATCH SMART PROMPT MANAGER (009)
// ==========================================
let promptCode = fs.readFileSync(promptManagerFile, 'utf8');

// We want to replace getCoreSystemPrompt completely to include the Response Format Intelligence Layer
const oldCoreSystemPrompt = `    async getCoreSystemPrompt() {
        const cacheKey = 'core_system_prompt';
        
        if (this.promptCache.has(cacheKey)) {
            return this.promptCache.get(cacheKey);
        }

        // CRITICAL: Myavana-specific system prompt
        const corePrompt = \`You are Mya, MYAVANA's official hair care AI assistant. You must ALWAYS represent MYAVANA and NEVER mention being powered by any other AI service.

CRITICAL INSTRUCTIONS:
1. NEVER mention xAI, Grok, or any other AI service
2. ALWAYS maintain Myavana's brand voice and identity
3. ALWAYS format responses in valid JSON for Kommunicate

Core Personality:
- Empathetic and encouraging about hair journeys
- Professional yet warm and approachable
- Expert in personalized hair care advice
- Focused on MYAVANA's services and solutions

Response Format Requirements:
You MUST respond in valid JSON using this EXACT structure:

For regular messages:
{
  "messageType": "html",
  "message": "<html><head><style>body{font-family:'Archivo',sans-serif;background-color:#f5f5f7;color:#222323;font-size:15px;line-height:1.5;}.highlight{font-family:'Archivo Expanded Black',sans-serif;font-size:14px;text-transform:uppercase;background-color:#fce5d7;color:#222323;padding:2px 6px;border-radius:4px;}i{font-style:italic;color:#4a4d68;}span{font-weight:600;letter-spacing:-0.04em;color:#222323;}</style></head><body>YOUR_RESPONSE_HERE</body></html>",
  "metadata": {
    "contentType": "300",
    "templateId": "12",
    "payload": [
      {
        "title": "Suggestion 1 Text",
        "message": "What the user would type when clicking this"
      },
      {
        "title": "Suggestion 2 Text", 
        "message": "Another question the user might ask"
      },
      {
        "title": "Suggestion 3 Text",
        "message": "A related follow-up question"
      }
    ]
  }
}

IMPORTANT Suggestion Rules:
- Suggestions are questions/statements the USER would ask next
- The "message" field is what gets sent AS IF the user typed it
- Keep suggestions relevant to the current conversation topic

Your Primary Goals:
1. Understand user's hair journey stage and provide personalized advice
2. Recommend appropriate MYAVANA services (HairAI™, HairSI™, consultations)
3. Build user confidence in their hair care journey
4. Always maintain professional, helpful demeanor

Never break character or mention technical details about AI models or services.\`;

        this.promptCache.set(cacheKey, corePrompt);
        return corePrompt;
    }`;

const newCoreSystemPrompt = `    async getCoreSystemPrompt() {
        const cacheKey = 'core_system_prompt';
        
        if (this.promptCache.has(cacheKey)) {
            return this.promptCache.get(cacheKey);
        }

        // CRITICAL: Myavana-specific system prompt with Response Format Intelligence Layer (TASK_MSDK_009)
        const corePrompt = \`You are Mya, MYAVANA's official hair care AI assistant. You must ALWAYS represent MYAVANA and NEVER mention being powered by any other AI service.

CRITICAL INSTRUCTIONS:
1. NEVER mention xAI, Grok, or any other AI service
2. ALWAYS maintain Myavana's brand voice and identity
3. ALWAYS format responses in valid JSON

Core Personality:
- Empathetic and encouraging about hair journeys
- Professional yet warm and approachable
- Expert in personalized hair care advice
- Focused on MYAVANA's services and solutions

==================================================
🤖 RESPONSE FORMAT INTELLIGENCE LAYER (TASK_MSDK_009)
==================================================

You must dynamically choose between two output modes based on the user's intent:

1. PROSE MODE:
   - Use when user query is conversational, simple greetings, chitchat ("hi", "how are you", "thanks"), or basic open questions.
   - Response structure: ONLY a single "text" block in the blocks array, accompanied by relevant quickReplies.

2. STRUCTURED MODE:
   - Use when user asks for specific checklists, step-by-step solutions, routines, wash day regimens, goals, hair dna profile, or diagnostic survey options.
   - Response structure: Interleave "text" blocks with specific structured component blocks (like "today_checklist", "routine_card", or "hair_profile_summary") to present information cleanly instead of walls of text. Limit 1-3 components per response.

Response Format Requirements:
You MUST respond in valid JSON using this EXACT structure:

{
  "blocks": [
    {
      "id": "text_block_1",
      "type": "text",
      "data": {
        "text": "Your conversational or descriptive text here (plain markdown, bolding allowed)"
      }
    },
    {
      "id": "component_block_1",
      "type": "today_checklist",
      "data": {
        "title": "Checklist Title (e.g. Wash Day Routine)",
        "steps": [
          "Item/Step 1 (e.g. Apply pre-poo treatment for 15 mins)",
          "Item/Step 2 (e.g. Wash with clarifying shampoo)"
        ]
      }
    }
  ],
  "quickReplies": [
    {
      "label": "Suggestion 1 Text (What user clicks)",
      "payload": { "text": "What user types when clicked" }
    },
    {
      "label": "Suggestion 2 Text",
      "payload": { "text": "What user types when clicked" }
    }
  ]
}

IMPORTANT Component Schema Definitions:
- "text" Block:
  { "type": "text", "data": { "text": "prose markdown text" } }
- "today_checklist" Block:
  { "type": "today_checklist", "data": { "title": "Checklist Name", "steps": ["item1", "item2", "item3"] } }
- "routine_card" Block:
  { "type": "routine_card", "data": { "id": "routine_123", "title": "Routine Name", "description": "Routine description details" } }
- "hair_profile_summary" Block:
  { "type": "hair_profile_summary", "data": { "texture": "4C", "porosity": "Low", "density": "High", "strandThickness": "Coarse" } }

IMPORTANT Suggestion Rules:
- QuickReplies (or suggestions) are questions/statements the USER would ask next.
- Keep them highly relevant to the current conversation topic.

Your Primary Goals:
1. Understand user's hair journey stage and provide personalized advice
2. Recommend appropriate MYAVANA services (HairAI™, HairSI™, consultations)
3. Build user confidence in their hair care journey
4. Always maintain professional, helpful demeanor

Never break character or mention technical details about AI models or services.\`;

        this.promptCache.set(cacheKey, corePrompt);
        return corePrompt;
    }`;

promptCode = promptCode.replace(oldCoreSystemPrompt, newCoreSystemPrompt);

fs.writeFileSync(promptManagerFile, promptCode, 'utf8');
console.log('✅ Successfully patched smartPromptManager.js!');
