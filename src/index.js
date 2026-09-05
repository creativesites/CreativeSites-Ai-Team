const path = require('path');
const EventBus = require('./events');
const AgentRegistry = require('./registry');
const InboxManager = require('./inboxes');
const TaskManager = require('./tasks');
const RuntimeController = require('./runtime');
const VerificationEngine = require('./verifier');
const MyaDoctor = require('./doctor');
const Orchestrator = require('./orchestrator');
const { ProvenanceEngine, EVIDENCE_CLASSES } = require('./provenance');

const ProofBundleEngine = require('./chain/proofBundle');
const TestVerificationRecorder = require('./testRecorder');

function initMyaOS(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, '..');
  const communityDir = path.join(baseDir, 'community');

  const eventBus = new EventBus(path.join(communityDir, 'events.ndjson'));
  const provenance = new ProvenanceEngine(baseDir);
  const registry = new AgentRegistry(path.join(communityDir, 'agents.json'), eventBus, { provenance });
  const inboxes = new InboxManager(path.join(communityDir, 'inboxes'), eventBus);
  const taskManager = new TaskManager(path.join(communityDir, 'tasks.json'), registry, inboxes, eventBus, { provenance });
  const runtime = new RuntimeController(registry, inboxes, eventBus, { baseDir, sockDir: options.sockDir, provenance });
  const verifier = new VerificationEngine(taskManager, eventBus, { provenance });
  const doctor = new MyaDoctor({ registry, taskManager, inboxManager: inboxes, eventBus, runtime, baseDir });
  const orchestrator = new Orchestrator({ registry, taskManager, inboxManager: inboxes, runtime, eventBus });
  const proofBundle = new ProofBundleEngine(baseDir);
  const testRecorder = new TestVerificationRecorder(baseDir);

  return {
    eventBus,
    provenance,
    registry,
    inboxes,
    taskManager,
    runtime,
    verifier,
    doctor,
    orchestrator,
    proofBundle,
    testRecorder
  };
}

module.exports = {
  initMyaOS,
  EventBus,
  ProvenanceEngine,
  EVIDENCE_CLASSES,
  AgentRegistry,
  InboxManager,
  TaskManager,
  RuntimeController,
  VerificationEngine,
  MyaDoctor,
  Orchestrator,
  ProofBundleEngine,
  TestVerificationRecorder
};

