const snapshot = require('../data/agentRoles.json');

const url = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true';
const allowed = new Set(['Duelist', 'Initiator', 'Controller', 'Sentinel']);
const normalize = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const roles = new Map(Object.entries(snapshot).map(([name, role]) => [normalize(name), role]));

function roleOf(agent) {
  return roles.get(normalize(agent)) ?? null;
}

// Refresh in the background. A failed or incomplete response leaves bundled roles available.
async function refreshAgentRoles() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return;
    const { data } = await response.json();
    if (!Array.isArray(data)) return;
    for (const agent of data) {
      const name = normalize(agent?.displayName);
      const role = agent?.role?.displayName;
      if (name && allowed.has(role)) roles.set(name, role);
    }
  } catch {
    // Role metadata is optional.
  }
}

module.exports = { roleOf, refreshAgentRoles };
