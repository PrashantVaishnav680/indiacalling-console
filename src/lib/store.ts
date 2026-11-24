import {
  IAgent,
  ICall,
  ICampaign,
  IKnowledgeBase,
  ILead,
  ILeadAssignment,
  IOrganization,
  ITranscript,
} from "@/types";
import { computeAgentMetrics } from "@/lib/analytics-counters";

export interface SyncSummary {
  lastSyncedAt: string | null;
  importedAgents: number;
  updatedAgents: number;
  pushedAgents: number;
  syncedCalls: number;
  updatedCalls: number;
  errors: string[];
}

export interface DataStore {
  organization: IOrganization;
  organizations: IOrganization[];
  knowledgeBases: IKnowledgeBase[];
  agents: IAgent[];
  leads: ILead[];
  campaigns: ICampaign[];
  calls: ICall[];
  transcripts: Record<string, ITranscript>;
  assignments: ILeadAssignment[];
  syncState: SyncSummary;
}

declare global {
  var __INDIACALLING_STORE__: DataStore | undefined;
}

const defaultOrganization: IOrganization = {
  _id: "org_default_01",
  name: "IndiaCalling Console",
  slug: "indiacalling-org",
  email: "admin@indiacalling.ai",
  phone: "+91 11 6929 4000",
  address: "Cyber City, Gurugram, India",
  industry: "B2B SaaS & Automation",
  ownerName: "Aditi Rao",
  ownerEmail: "clientadmin@demo.com",
  status: "active",
  settings: {
    callingHours: {
      start: "09:30",
      end: "18:30",
      timezone: "Asia/Kolkata",
    },
    maxConcurrentCalls: 10,
    defaultLanguage: "English + Hindi",
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

if (!global.__INDIACALLING_STORE__) {
  global.__INDIACALLING_STORE__ = {
    organization: defaultOrganization,
    organizations: [defaultOrganization],
    knowledgeBases: [],
    agents: [],
    leads: [],
    campaigns: [],
    calls: [],
    transcripts: {},
    assignments: [],
    syncState: {
      lastSyncedAt: null,
      importedAgents: 0,
      updatedAgents: 0,
      pushedAgents: 0,
      syncedCalls: 0,
      updatedCalls: 0,
      errors: [],
    },
  };
}

export const store = global.__INDIACALLING_STORE__;

export function getStore(): DataStore {
  if (!global.__INDIACALLING_STORE__!.organizations) {
    global.__INDIACALLING_STORE__!.organizations = [defaultOrganization];
  }
  if (!global.__INDIACALLING_STORE__!.knowledgeBases) {
    global.__INDIACALLING_STORE__!.knowledgeBases = [];
  }
  return global.__INDIACALLING_STORE__!;
}

export function getSyncState(): SyncSummary {
  return getStore().syncState;
}

export function setSyncState(summary: Partial<SyncSummary>): SyncSummary {
  Object.assign(getStore().syncState, summary);
  return getStore().syncState;
}

// Organizations
export function getOrganizations(): IOrganization[] {
  return getStore().organizations;
}

export function getOrganizationById(id: string): IOrganization | undefined {
  return getStore().organizations.find(
    (o) => String(o._id) === String(id) || o.slug === id
  );
}

export function addOrganization(org: IOrganization): IOrganization {
  const existing = getOrganizationById(org._id);
  if (existing) {
    Object.assign(existing, org, { updatedAt: new Date() });
    return existing;
  }
  getStore().organizations.unshift(org);
  return org;
}

export function updateOrganization(
  id: string,
  updates: Partial<IOrganization>
): IOrganization | undefined {
  const org = getOrganizationById(id);
  if (org) {
    Object.assign(org, updates, { updatedAt: new Date() });
  }
  return org;
}

// Knowledge Bases
export function getKnowledgeBases(): IKnowledgeBase[] {
  return getStore().knowledgeBases;
}

export function getKnowledgeBaseById(id: string): IKnowledgeBase | undefined {
  return getStore().knowledgeBases.find((kb) => String(kb._id) === String(id));
}

export function addKnowledgeBase(kb: IKnowledgeBase): IKnowledgeBase {
  const existing = getKnowledgeBaseById(kb._id);
  if (existing) {
    Object.assign(existing, kb, { updatedAt: new Date() });
    return existing;
  }
  getStore().knowledgeBases.unshift(kb);
  return kb;
}

export function updateKnowledgeBase(
  id: string,
  updates: Partial<IKnowledgeBase>
): IKnowledgeBase | undefined {
  const kb = getKnowledgeBaseById(id);
  if (kb) {
    Object.assign(kb, updates, { updatedAt: new Date() });
  }
  return kb;
}

export function deleteKnowledgeBase(id: string): boolean {
  const idx = getStore().knowledgeBases.findIndex(
    (kb) => String(kb._id) === String(id)
  );
  if (idx !== -1) {
    getStore().knowledgeBases.splice(idx, 1);
    return true;
  }
  return false;
}

// Agents
export function getAgents(): IAgent[] {
  return getStore().agents;
}

export function getAgentById(id: string): IAgent | undefined {
  return getStore().agents.find(
    (a) =>
      String(a._id) === String(id) ||
      (a.bolnaAgentId && a.bolnaAgentId === id)
  );
}

export function getAgentByBolnaId(bolnaAgentId: string): IAgent | undefined {
  if (!bolnaAgentId) return undefined;
  return getStore().agents.find((a) => a.bolnaAgentId === bolnaAgentId);
}

export function addAgent(agent: IAgent): IAgent {
  const existingIdx = getStore().agents.findIndex(
    (a) =>
      String(a._id) === String(agent._id) ||
      (agent.bolnaAgentId && a.bolnaAgentId === agent.bolnaAgentId)
  );
  if (existingIdx !== -1) {
    getStore().agents[existingIdx] = {
      ...getStore().agents[existingIdx],
      ...agent,
      updatedAt: new Date(),
    };
    return getStore().agents[existingIdx];
  }
  getStore().agents.unshift(agent);
  return agent;
}

export function upsertAgentByBolnaId(agent: IAgent): {
  agent: IAgent;
  created: boolean;
} {
  const existing =
    (agent.bolnaAgentId ? getAgentByBolnaId(agent.bolnaAgentId) : undefined) ||
    getAgentById(agent._id);
  if (existing) {
    Object.assign(existing, agent, {
      _id: existing._id,
      updatedAt: new Date(),
    });
    return { agent: existing, created: false };
  }
  getStore().agents.unshift(agent);
  return { agent, created: true };
}

export function updateAgent(
  id: string,
  updates: Partial<IAgent>
): IAgent | undefined {
  const agent = getAgentById(id);
  if (agent) {
    Object.assign(agent, updates, { updatedAt: new Date() });
  }
  return agent;
}

export function deleteAgent(id: string): boolean {
  const index = getStore().agents.findIndex(
    (a) => String(a._id) === String(id) || a.bolnaAgentId === id
  );
  if (index !== -1) {
    getStore().agents.splice(index, 1);
    return true;
  }
  return false;
}

export function recomputeAgentMetrics(agentId: string): void {
  const agent = getAgentById(agentId);
  if (!agent) return;
  agent.metrics = computeAgentMetrics(
    agent,
    getStore().calls,
    getStore().leads,
    getStore().campaigns
  );
}

// Leads
export function getLeads(): ILead[] {
  return getStore().leads;
}

export function addLead(lead: ILead): ILead {
  const existing = getStore().leads.find(
    (l) => String(l._id) === String(lead._id)
  );
  if (existing) {
    Object.assign(existing, lead, { updatedAt: new Date() });
    return existing;
  }
  getStore().leads.unshift(lead);
  return lead;
}

export function getLeadById(id: string): ILead | undefined {
  return getStore().leads.find((l) => String(l._id) === String(id));
}

export function updateLead(
  id: string,
  updates: Partial<ILead>
): ILead | undefined {
  const lead = getLeadById(id);
  if (lead) {
    Object.assign(lead, updates, { updatedAt: new Date() });
  }
  return lead;
}

export function deleteLead(id: string): boolean {
  const index = getStore().leads.findIndex((l) => String(l._id) === String(id));
  if (index !== -1) {
    getStore().leads.splice(index, 1);
    return true;
  }
  return false;
}

// Campaigns
export function getCampaigns(): ICampaign[] {
  return getStore().campaigns;
}

export function addCampaign(campaign: ICampaign): ICampaign {
  getStore().campaigns.unshift(campaign);
  return campaign;
}

export function getCampaignById(id: string): ICampaign | undefined {
  return getStore().campaigns.find((c) => String(c._id) === String(id));
}

export function updateCampaign(
  id: string,
  updates: Partial<ICampaign>
): ICampaign | undefined {
  const campaign = getCampaignById(id);
  if (campaign) {
    Object.assign(campaign, updates, { updatedAt: new Date() });
  }
  return campaign;
}

export function deleteCampaign(id: string): boolean {
  const index = getStore().campaigns.findIndex(
    (c) => String(c._id) === String(id)
  );
  if (index !== -1) {
    getStore().campaigns.splice(index, 1);
    return true;
  }
  return false;
}

// Calls
export function getCalls(): ICall[] {
  return getStore().calls;
}

export function getCallById(id: string): ICall | undefined {
  return getStore().calls.find(
    (c) =>
      String(c._id) === String(id) ||
      c.bolnaCallId === id ||
      c.bolnaExecutionId === id
  );
}

export function getCallByBolnaId(bolnaCallOrExecId: string): ICall | undefined {
  if (!bolnaCallOrExecId) return undefined;
  return getStore().calls.find(
    (c) =>
      c.bolnaCallId === bolnaCallOrExecId ||
      c.bolnaExecutionId === bolnaCallOrExecId
  );
}

export function addCall(call: ICall): ICall {
  const execId = call.bolnaExecutionId || call.bolnaCallId;
  if (execId) {
    const existing = getCallByBolnaId(execId);
    if (existing) {
      Object.assign(existing, call, {
        _id: existing._id,
        updatedAt: new Date(),
      });
      recomputeAgentMetrics(existing.agentId);
      return existing;
    }
  }

  getStore().calls.unshift(call);
  recomputeAgentMetrics(call.agentId);
  return call;
}

export function upsertCallByExecutionId(call: ICall): {
  call: ICall;
  created: boolean;
} {
  const execId = call.bolnaExecutionId || call.bolnaCallId;
  const existing =
    (execId ? getCallByBolnaId(execId) : undefined) || getCallById(call._id);
  if (existing) {
    Object.assign(existing, call, {
      _id: existing._id,
      updatedAt: new Date(),
    });
    recomputeAgentMetrics(existing.agentId);
    return { call: existing, created: false };
  }
  getStore().calls.unshift(call);
  recomputeAgentMetrics(call.agentId);
  return { call, created: true };
}

export function updateCall(
  id: string,
  updates: Partial<ICall>
): ICall | undefined {
  const call = getCallById(id);
  if (call) {
    Object.assign(call, updates, { updatedAt: new Date() });
    recomputeAgentMetrics(call.agentId);
  }
  return call;
}

// Transcripts
export function getTranscript(callId: string): ITranscript | undefined {
  return getStore().transcripts[callId];
}

export function addTranscript(transcript: ITranscript): ITranscript {
  getStore().transcripts[transcript.callId] = transcript;
  return transcript;
}

// Sales Handoff
export function getAssignments(): ILeadAssignment[] {
  return getStore().assignments;
}

export function addAssignment(assignment: ILeadAssignment): ILeadAssignment {
  getStore().assignments.unshift(assignment);
  return assignment;
}

export function updateAssignment(
  id: string,
  updates: Partial<ILeadAssignment>
): ILeadAssignment | undefined {
  const item = getStore().assignments.find(
    (a) => String(a._id) === String(id)
  );
  if (item) {
    Object.assign(item, updates, { updatedAt: new Date() });
  }
  return item;
}

export function clearAllSampleData() {
  const s = getStore();
  s.agents = [];
  s.leads = [];
  s.campaigns = [];
  s.calls = [];
  s.transcripts = {};
  s.assignments = [];
}
