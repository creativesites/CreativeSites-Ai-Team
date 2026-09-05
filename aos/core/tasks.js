const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TASKS_PATH = path.resolve(__dirname, '../../data/tasks.json');

class TaskStore {
  constructor(filePath = DEFAULT_TASKS_PATH) {
    this.filePath = filePath;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  getAll() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  save(tasks) {
    fs.writeFileSync(this.filePath, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  getTask(id) {
    const tasks = this.getAll();
    return tasks.find(t => t.id === id) || null;
  }

  createTask({
    id,
    title,
    description = '',
    requiredCapabilities = [],
    priority = 'MEDIUM',
    assignee = null,
    dependencies = [],
    reviewer = null
  }) {
    const tasks = this.getAll();
    const taskId = id || `TASK-${String(tasks.length + 1).padStart(3, '0')}`;

    if (tasks.some(t => t.id === taskId)) {
      throw new Error(`Task with ID ${taskId} already exists`);
    }

    const newTask = {
      id: taskId,
      title,
      description,
      requiredCapabilities: Array.isArray(requiredCapabilities) ? requiredCapabilities : [],
      priority,
      assignee,
      status: assignee ? 'ASSIGNED' : 'TODO',
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      reviewer,
      evidence: null,
      verificationResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    };

    tasks.push(newTask);
    this.save(tasks);
    return newTask;
  }

  assignTask(id, assignee) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.assignee = assignee;
    task.status = 'ASSIGNED';
    task.updatedAt = new Date().toISOString();
    this.save(tasks);
    return task;
  }

  updateStatus(id, status) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);

    const validStatuses = ['TODO', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'VERIFIED', 'BLOCKED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid task status: ${status}`);
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (status === 'VERIFIED') {
      task.completedAt = new Date().toISOString();
    }
    this.save(tasks);
    return task;
  }

  attachEvidence(id, evidence) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.evidence = {
      ...evidence,
      recordedAt: new Date().toISOString()
    };
    task.updatedAt = new Date().toISOString();
    this.save(tasks);
    return task;
  }

  attachVerification(id, verificationResult) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.verificationResult = {
      ...verificationResult,
      verifiedAt: new Date().toISOString()
    };
    task.status = verificationResult.passed ? 'VERIFIED' : 'BLOCKED';
    task.updatedAt = new Date().toISOString();
    if (verificationResult.passed) {
      task.completedAt = new Date().toISOString();
    }
    this.save(tasks);
    return task;
  }

  areDependenciesMet(id) {
    const task = this.getTask(id);
    if (!task || !task.dependencies || task.dependencies.length === 0) return true;

    const allTasks = this.getAll();
    return task.dependencies.every(depId => {
      const dep = allTasks.find(t => t.id === depId);
      return dep && dep.status === 'VERIFIED';
    });
  }

  getTasksByStatus(status) {
    return this.getAll().filter(t => t.status === status);
  }
}

module.exports = { TaskStore, DEFAULT_TASKS_PATH };
