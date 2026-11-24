import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const agentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  category: z.string().optional(),
  agentType: z.enum(["inbound", "outbound", "both"]).default("outbound"),
  language: z.string().min(1, "Language is required"),
  voiceProvider: z.string().min(1, "Voice provider is required"),
  voiceId: z.string().min(1, "Voice selection is required"),
  voiceName: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
  pitch: z.number().min(0.5).max(2.0).optional().default(1.0),
  systemPrompt: z.string().min(10, "System prompt must be at least 10 characters"),
  greetingMessage: z.string().min(3, "Greeting message must be at least 3 characters"),
  businessInfo: z.string().optional(),
  conversationGoals: z.array(z.string()).optional(),
  qualificationCriteria: z.union([z.array(z.string()), z.string()]).optional(),
  maxDurationSeconds: z.number().min(30).max(3600).default(300),
  phoneNumber: z.string().optional(),
  testingMode: z
    .enum(["simulated", "browser_web_call", "outbound_test_call"])
    .optional()
    .default("browser_web_call"),
  status: z.enum(["active", "inactive", "draft", "paused"]).optional(),
});

export const leadSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Valid phone number required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
  location: z.string().optional(),
  industry: z.string().optional(),
  source: z.string().default("Manual"),
  notes: z.string().optional(),
});

export const campaignSchema = z.object({
  name: z.string().min(2, "Campaign name is required"),
  description: z.string().optional(),
  agentId: z.string().min(1, "Select an agent"),
  leadIds: z.array(z.string()).min(1, "Select at least one lead"),
  scheduleStartDate: z.string().min(1, "Start date required"),
  callingStartHour: z.string().min(1, "Start hour required"),
  callingEndHour: z.string().min(1, "End hour required"),
  timezone: z.string().default("Asia/Kolkata"),
  maxRetries: z.number().min(0).max(5).default(2),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export const initiateCallSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  phoneNumber: z.string().optional().default("Browser Web-Call"),
  fromPhoneNumber: z.string().optional(),
  leadId: z.string().optional(),
  campaignId: z.string().optional(),
  direction: z.enum(["inbound", "outbound", "web_call"]).default("outbound"),
  testingMode: z
    .enum(["simulated", "browser_web_call", "outbound_test_call"])
    .optional()
    .default("outbound_test_call"),
  confirmedRealCall: z.boolean().optional(),
  bolnaExecutionId: z.string().optional(),
  durationSeconds: z.number().optional(),
  score: z.number().optional(),
  qualificationReason: z.string().optional(),
  messages: z
    .array(
      z.object({
        speaker: z.enum(["agent", "customer", "system"]),
        text: z.string(),
        timestamp: z.string(),
      })
    )
    .optional(),
});

export const leadAssignmentSchema = z.object({
  leadId: z.string().min(1, "Lead ID required"),
  salespersonId: z.string().min(1, "Salesperson required"),
  notes: z.string().optional(),
});
