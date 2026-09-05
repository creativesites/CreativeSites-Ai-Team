const path = require('path');
const EventBus = require('./events');
const AgentRegistry = require('./registry');
const InboxManager = require('./inboxes');
const TaskManager = require('./tasks');
const RuntimeController = require('./runtime');
const VerificationEngine = require('./verifier');
const MyaDoctor = require('./doctor');
const Orchestrator = require('./orchestrator');

function initMyaOS(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, '..');
  const communityDir = path.join(baseDir, 'community');

  const eventBus = new EventBus(path.join(communityDir, 'events.ndjson'));
  const registry = new AgentRegistry(path.join(communityDir, 'agents.json'), eventBus);
  const inboxes = new InboxManager(path.join(communityDir, 'inboxes'), eventBus);
  const taskManager = new TaskManager(path.join(communityDir, 'tasks.json'), registry, inboxes, eventBus);
  const runtime = new RuntimeController(registry, inboxes, eventBus);
  const verifier = new VerificationEngine(taskManager, eventBus);
  const doctor = new MyaDoctor({ registry, taskManager, inboxManager: inboxes, eventBus, baseDir });
  const orchestrator = new Orchestrator({ registry, taskManager, inboxManager: inboxes, runtime, eventBus });

  return {
    eventBus,
    registry,
    inboxes,
    taskManager,
    runtime,
    verifier,
    doctor,
    orchestrator
  };
}

module.exports = {
  initMyaOS,
  EventBus,
  AgentRegistry,
  InboxManager,
  TaskManager,
  RuntimeController,
  VerificationEngine,
  MyaDoctor,
  Orchestrator
};
