class CapabilityRouter {
  constructor(registry) {
    this.registry = registry;
  }

  routeTask(task) {
    const required = task.requiredCapabilities || [];
    if (required.length === 0) {
      // Default to any available agent
      const all = this.registry.getAll();
      const idle = all.find(a => a.status === 'IDLE') || all[0];
      return {
        matchedAgent: idle,
        score: 1.0,
        candidates: all.map(a => ({ agent: a, score: 1.0 }))
      };
    }

    const candidates = this.registry.findAgentsByCapabilities(required);

    if (candidates.length === 0) {
      return {
        matchedAgent: null,
        score: 0,
        unmatchedCapabilities: required,
        reason: 'No registered agents possess the required capabilities'
      };
    }

    // Rank candidates: capability score first, then availability bonus
    const ranked = candidates.map(c => {
      let availabilityBonus = 0;
      if (c.agent.status === 'IDLE') availabilityBonus = 0.2;
      else if (c.agent.status === 'SLEEPING') availabilityBonus = 0.1;
      else if (c.agent.status === 'WORKING') availabilityBonus = -0.2;

      const compositeScore = Math.min(1.0, c.score + availabilityBonus);
      return {
        ...c,
        compositeScore
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    const topMatch = ranked[0];
    return {
      matchedAgent: topMatch.agent,
      score: topMatch.score,
      compositeScore: topMatch.compositeScore,
      matchedCapabilities: topMatch.matchedCapabilities,
      candidates: ranked
    };
  }
}

module.exports = { CapabilityRouter };
