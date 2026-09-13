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
describe('Mya Context Pipeline Audit (TASK_MSDK_006)', () => {
  it('correctly tracks and rotates user actions dynamically in the host bridge', () => {
    const bridge = require('../src/services/mya/MyAvanaMobileHostBridge');
    
    // Clear and execute sync routes to capture action history
    bridge.syncRoute('Dashboard');
    bridge.syncRoute('HairAnalysis');
    bridge.syncRoute('HairDiary');

    const context = bridge.getAppContext();
    
    expect(context.recentActions).toBeDefined();
    expect(Array.isArray(context.recentActions)).toBe(true);
    expect(context.recentActions).toContain('viewed_dashboard');
    expect(context.recentActions).toContain('viewed_hairanalysis');
    expect(context.recentActions).toContain('viewed_hairdiary');
  });

  it('correctly forwards top-level fields (streak, recentActions, state, entity) expected by ExperienceContextService', () => {
    const bridge = require('../src/services/mya/MyAvanaMobileHostBridge');

    const extraContext = {
      streak: 7,
      state: { viewingGoalId: 'g_123' },
      entity: { product_name: 'HairSI Kit' }
    };

    const context = bridge.getAppContext(extraContext);

    expect(context.streak).toBe(7);
    expect(context.state).toEqual({ viewingGoalId: 'g_123' });
    expect(context.entity).toEqual({ product_name: 'HairSI Kit' });
    expect(context.surface).toBe('myavana_mobile_app');
  });
});
`;

code += testsAppend;

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully appended context pipeline audit tests to myaRichRegistry.test.js!');
