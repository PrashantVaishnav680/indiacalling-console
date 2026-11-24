import type {
  IAgent,
  IAgentComputedMetrics,
  ICall,
  ICampaign,
  ILead,
} from "@/types";

/**
 * Verifiable, Organization-Scoped Analytics & Counter Engine (`src/lib/analytics-counters.ts`)
 * Establishes strict relationships across:
 *   Organization -> Agent -> Campaign -> Lead -> Call -> Bolna Execution
 * Distinguishes:
 *   - Call requested / initiated
 *   - Call accepted by Bolna (has bolnaExecutionId / bolnaCallId)
 *   - Call connected (answered, in_progress, or completed with duration > 0)
 *   - Call completed
 *   - Call failed (failed, busy, no_answer, cancelled)
 */

export function isCallMatchingAgent(call: ICall, agent: IAgent): boolean {
  if (!call || !agent) return false;
  if (String(call.agentId) === String(agent._id)) return true;
  if (
    agent.bolnaAgentId &&
    (String(call.agentId) === String(agent.bolnaAgentId) ||
      String(call.bolnaAgentId) === String(agent.bolnaAgentId))
  ) {
    return true;
  }
  return false;
}

export function computeAgentMetrics(
  agent: IAgent,
  allCalls: ICall[],
  allLeads: ILead[],
  allCampaigns: ICampaign[]
): IAgentComputedMetrics {
  const orgId = String(agent.organizationId || "org_default_01");

  // 1. Filter organization-scoped calls belonging to this agent (deduplicated by bolnaExecutionId or _id)
  const seenCallKeys = new Set<string>();
  const agentCalls: ICall[] = [];

  for (const c of allCalls) {
    if (c.organizationId && String(c.organizationId) !== orgId) continue;
    if (!isCallMatchingAgent(c, agent)) continue;
    const dedupeKey = String(c.bolnaExecutionId || c.bolnaCallId || c._id);
    if (seenCallKeys.has(dedupeKey)) continue;
    seenCallKeys.add(dedupeKey);
    agentCalls.push(c);
  }

  // 2. Filter campaigns using this agent
  const agentCampaigns = allCampaigns.filter(
    (camp) =>
      (!camp.organizationId || String(camp.organizationId) === orgId) &&
      (String(camp.agentId) === String(agent._id) ||
        (agent.bolnaAgentId && String(camp.agentId) === String(agent.bolnaAgentId)))
  );
  const activeCampaigns = agentCampaigns.filter(
    (c) => c.status === "running" || c.status === "scheduled"
  ).length;

  // 3. Associated Leads (via assignedAgentId, campaign leadIds, direct calls, or called lead phone numbers)
  const associatedLeadKeys = new Set<string>();
  const campaignLeadIds = new Set<string>();
  for (const camp of agentCampaigns) {
    for (const lid of camp.leadIds || []) {
      campaignLeadIds.add(String(lid));
      associatedLeadKeys.add(String(lid));
    }
  }

  // Map of phone -> lead._id
  const phoneToLeadId = new Map<string, string>();
  for (const l of allLeads) {
    if (l.phone) phoneToLeadId.set(l.phone, String(l._id));
  }

  // Any lead explicitly assigned to this agent or in its campaigns
  for (const l of allLeads) {
    if (l.organizationId && String(l.organizationId) !== orgId) continue;
    if (
      String(l.assignedAgentId) === String(agent._id) ||
      (agent.bolnaAgentId &&
        String(l.assignedAgentId) === String(agent.bolnaAgentId)) ||
      campaignLeadIds.has(String(l._id))
    ) {
      associatedLeadKeys.add(String(l._id));
    }
  }

  // Any lead that this agent actually interacted with / called
  for (const c of agentCalls) {
    if (c.leadId) {
      associatedLeadKeys.add(String(c.leadId));
    } else if (c.phoneNumber && c.phoneNumber !== "Unknown") {
      const matchedLeadId = phoneToLeadId.get(c.phoneNumber);
      if (matchedLeadId) {
        associatedLeadKeys.add(matchedLeadId);
      } else {
        associatedLeadKeys.add(`phone:${c.phoneNumber}`);
      }
    }
  }

  // 4. Call lifecycle stage counts
  const callsInitiated = agentCalls.length;
  const callsAcceptedByBolna = agentCalls.filter((c) =>
    Boolean(c.bolnaExecutionId || c.bolnaCallId || c.acceptedByBolna)
  ).length;
  const connectedCalls = agentCalls.filter(
    (c) =>
      c.status === "answered" ||
      c.status === "in_progress" ||
      c.status === "completed" ||
      (c.durationSeconds && c.durationSeconds > 0)
  ).length;
  const successfulCalls = agentCalls.filter(
    (c) => c.status === "completed"
  ).length;
  const failedCalls = agentCalls.filter(
    (c) =>
      c.status === "failed" ||
      c.status === "no_answer" ||
      c.status === "busy" ||
      c.status === "cancelled"
  ).length;

  // 5. Qualified leads count (unique leads verified qualified by this agent's calls)
  const qualifiedLeadKeys = new Set<string>();
  for (const c of agentCalls) {
    if (
      c.status === "completed" &&
      (c.qualificationResult?.status === "qualified" ||
        c.qualificationStatus === "qualified")
    ) {
      const key = String(
        c.leadId ||
          (c.phoneNumber && c.phoneNumber !== "Unknown"
            ? c.phoneNumber
            : c._id)
      );
      qualifiedLeadKeys.add(key);
    }
  }

  const qualifiedLeads = qualifiedLeadKeys.size;
  const conversionRate =
    callsInitiated > 0
      ? Number(((qualifiedLeads / callsInitiated) * 100).toFixed(1))
      : 0;

  const completedWithDuration = agentCalls.filter(
    (c) => (c.durationSeconds || 0) > 0
  );
  const totalSecs = completedWithDuration.reduce(
    (acc, c) => acc + (c.durationSeconds || 0),
    0
  );
  const avgDurationSeconds =
    completedWithDuration.length > 0
      ? Math.round(totalSecs / completedWithDuration.length)
      : 0;

  // 6. Last call timestamp
  let lastCallDate: Date | null = null;
  for (const c of agentCalls) {
    const d = new Date(c.startedAt || c.createdAt);
    if (!isNaN(d.getTime())) {
      if (!lastCallDate || d.getTime() > lastCallDate.getTime()) {
        lastCallDate = d;
      }
    }
  }

  return {
    totalLeads: associatedLeadKeys.size,
    totalCalls: callsInitiated,
    callsInitiated,
    callsAcceptedByBolna,
    connectedCalls,
    successfulCalls,
    failedCalls,
    qualifiedLeads,
    conversionRate,
    avgDurationSeconds,
    activeCampaigns,
    lastCallDate: lastCallDate ? lastCallDate.toISOString() : null,
  };
}

export function computeCampaignMetrics(
  campaign: ICampaign,
  allCalls: ICall[],
  allLeads: ILead[]
) {
  const leadIdSet = new Set((campaign.leadIds || []).map(String));
  const campaignLeads = allLeads.filter(
    (l) =>
      leadIdSet.has(String(l._id)) ||
      String(l.campaignId) === String(campaign._id)
  );
  const totalImported = Math.max(
    campaign.validationSummary?.importedRecords || 0,
    campaign.totalLeads || 0,
    leadIdSet.size,
    campaignLeads.length
  );
  const eligibleLeads = campaignLeads.filter((l) => !l.doNotContact).length || totalImported;

  // Deduplicated calls for this campaign
  const seenCallKeys = new Set<string>();
  const campaignCalls: ICall[] = [];
  for (const c of allCalls) {
    if (String(c.campaignId) !== String(campaign._id)) continue;
    const key = String(c.bolnaExecutionId || c.bolnaCallId || c._id);
    if (seenCallKeys.has(key)) continue;
    seenCallKeys.add(key);
    campaignCalls.push(c);
  }

  const callsInitiated = campaignCalls.length;
  const callsAcceptedByBolna = campaignCalls.filter((c) =>
    Boolean(c.bolnaExecutionId || c.bolnaCallId || c.acceptedByBolna)
  ).length;
  const callsInProgress = campaignCalls.filter(
    (c) =>
      c.status === "initiated" ||
      c.status === "ringing" ||
      c.status === "answered" ||
      c.status === "in_progress"
  ).length;
  const connectedCalls = campaignCalls.filter(
    (c) =>
      c.status === "answered" ||
      c.status === "in_progress" ||
      c.status === "completed" ||
      (c.durationSeconds || 0) > 0
  ).length;
  const completedCalls = campaignCalls.filter(
    (c) => c.status === "completed"
  ).length;
  const failedCalls = campaignCalls.filter(
    (c) => c.status === "failed" || c.status === "busy" || c.status === "cancelled"
  ).length;
  const noAnswerCalls = campaignCalls.filter(
    (c) => c.status === "no_answer"
  ).length;

  const qualifiedLeads = campaignCalls.filter(
    (c) =>
      c.qualificationResult?.status === "qualified" ||
      c.qualificationStatus === "qualified"
  ).length;

  // Leads that have had at least one terminal or active call attempt
  const attemptedLeadIds = new Set(
    campaignCalls.map((c) => String(c.leadId || c.phoneNumber))
  );
  const remainingLeads = Math.max(0, eligibleLeads - attemptedLeadIds.size);
  const queuedLeads = remainingLeads;

  return {
    totalLeads: totalImported,
    eligibleLeads,
    queuedLeads,
    callsInitiated,
    callsAcceptedByBolna,
    callsInProgress,
    connectedCalls,
    completedCalls,
    successfulCalls: completedCalls,
    failedCalls,
    noAnswerCalls,
    qualifiedLeads,
    remainingLeads,
  };
}
