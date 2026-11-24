export interface CuratedVoiceEntry {
  id: string;
  voiceId: string;
  name: string;
  provider: "elevenlabs" | "sarvam" | "cartesia" | "polly";
  model: string;
  gender: "Female" | "Male";
  accent: string;
  languages: string[];
  description: string;
  status: "active" | "in_development";
  visible: boolean;
}

/**
 * Curated Voice Registry — 100% Bolna AI v2 Docs-Verified Active Voices.
 * Retired voices (e.g., Sarvam bulbul:v1/v2 `meera` and retired ElevenLabs `pNInz6obpgDQGcFmaJgB`)
 * have been permanently removed to prevent HTTP 400 `voice_profiles` errors.
 */
export const CURATED_VOICE_REGISTRY: CuratedVoiceEntry[] = [
  {
    id: "voice_tripti",
    voiceId: "1Z7Y8o9cvUeWq8oLKgMY",
    name: "Tripti - Calm and Clear",
    provider: "elevenlabs",
    model: "eleven_turbo_v2_5",
    gender: "Female",
    accent: "Indian English & Hindi",
    languages: ["English + Hindi", "Hindi", "English"],
    description:
      "Warm, clear conversational Indian female voice verified for lead qualification & customer support.",
    status: "active",
    visible: true,
  },
  {
    id: "voice_anika",
    voiceId: "90ipbRoKi4CpHXvKVtl0",
    name: "Anika - Customer Care Agent",
    provider: "elevenlabs",
    model: "eleven_turbo_v2_5",
    gender: "Female",
    accent: "Indian English & Hindi",
    languages: ["English + Hindi", "Hindi", "English"],
    description:
      "Studio-grade Indian/Global Indian female voice tailored for polite customer care and sales discovery.",
    status: "active",
    visible: true,
  },
  {
    id: "voice_raju",
    voiceId: "pzxut4zZz4GImZNlqQ3H",
    name: "Raju - Natural Conversationalist",
    provider: "elevenlabs",
    model: "eleven_turbo_v2_5",
    gender: "Male",
    accent: "Indian English & Hindi",
    languages: ["English + Hindi", "Hindi", "English"],
    description:
      "Studio-grade Indian/Global Indian male voice with natural cadence for consultative B2B & real estate calls.",
    status: "active",
    visible: true,
  },
  {
    id: "voice_priya_sarvam",
    voiceId: "priya",
    name: "Priya",
    provider: "sarvam",
    model: "bulbul:v3",
    gender: "Female",
    accent: "Pan-Indian Multilingual (11 Languages)",
    languages: [
      "Hindi",
      "English + Hindi",
      "English",
      "Gujarati",
      "Marathi",
      "Tamil",
      "Telugu",
      "Bengali",
      "Kannada",
      "Malayalam",
      "Odia",
    ],
    description:
      "Multilingual Indian Bulbul v3 voice supporting all 11 Indian languages (Hindi, Gujarati, Marathi, Tamil, Telugu, Bengali & more).",
    status: "active",
    visible: true,
  },
  {
    id: "voice_angelica",
    voiceId: "IkSv4tkouLJ6kYsQA7XD",
    name: "Angelica",
    provider: "elevenlabs",
    model: "eleven_turbo_v2_5",
    gender: "Female",
    accent: "Global English",
    languages: ["English"],
    description:
      "Studio-grade Indian/Global crisp English female voice for global SaaS & enterprise outbound.",
    status: "active",
    visible: true,
  },
  {
    id: "voice_john",
    voiceId: "z9bdYNSNQZi0g3cHsgzF",
    name: "John",
    provider: "elevenlabs",
    model: "eleven_turbo_v2_5",
    gender: "Male",
    accent: "Global English",
    languages: ["English"],
    description:
      "Studio-grade Indian/Global clear English male voice for executive outreach & support.",
    status: "active",
    visible: true,
  },
];

const RETIRED_VOICE_IDS = new Set([
  "pNInz6obpgDQGcFmaJgB",
  "21m00Tcm4TlvDq8ikWAM",
  "meera",
  "anushka",
  "abhilash",
  "aarti_in",
  "kavita_in",
  "rajesh_hi",
  "raveena_en",
  "rohan_cartesia",
]);

const INDIAN_REGIONAL_LANG_CODES = new Set([
  "gu",
  "mr",
  "ta",
  "te",
  "bn",
  "kn",
  "ml",
  "od",
  "pa",
]);

/**
 * Normalizes any legacy/retired voice or model combination into a valid Bolna v2
 * synthesizer configuration so createAgent / updateAgent never fails with HTTP 400.
 */
export function sanitizeBolnaVoiceSelection(params: {
  provider?: string;
  voiceId?: string;
  voiceName?: string;
  model?: string;
  isoLanguage?: string;
}): {
  provider: "elevenlabs" | "sarvam" | "cartesia" | "polly" | "deepgram";
  voiceId: string;
  voiceName: string;
  model: string;
} {
  const isoLang = (params.isoLanguage || "en").toLowerCase();
  const rawProvider = (params.provider || "elevenlabs").toLowerCase();
  const rawVoiceId = String(params.voiceId || "").trim();
  const rawModel = String(params.model || "").trim();

  // If user chose an Indian regional language (Gujarati, Marathi, Tamil, Telugu, Bengali, etc.)
  // and provider is elevenlabs/deepgram/polly with turbo v2.5 (which only speaks English/Hindi reliably)
  // or a retired voice ID, switch cleanly to Sarvam Bulbul v3 Priya (verified for all 11 Indian languages).
  if (
    INDIAN_REGIONAL_LANG_CODES.has(isoLang) &&
    (rawProvider.includes("sarvam") || RETIRED_VOICE_IDS.has(rawVoiceId))
  ) {
    return {
      provider: "sarvam",
      voiceId: "priya",
      voiceName: "Priya",
      model: "bulbul:v3",
    };
  }

  // If Sarvam is selected, enforce valid Bulbul v3/v4-flash model and non-retired voice
  if (rawProvider.includes("sarvam")) {
    const isRetiredSarvam =
      !rawVoiceId ||
      RETIRED_VOICE_IDS.has(rawVoiceId.toLowerCase()) ||
      rawModel === "bulbul:v1" ||
      rawModel === "bulbul:v2";
    if (isRetiredSarvam) {
      return {
        provider: "sarvam",
        voiceId: "priya",
        voiceName: "Priya",
        model: "bulbul:v3",
      };
    }
    return {
      provider: "sarvam",
      voiceId: rawVoiceId.toLowerCase(),
      voiceName: params.voiceName || "Priya",
      model: rawModel === "bulbul:v4-flash" ? "bulbul:v4-flash" : "bulbul:v3",
    };
  }

  // If a retired voice ID was passed for ElevenLabs/Cartesia/other, fall back safely
  if (!rawVoiceId || RETIRED_VOICE_IDS.has(rawVoiceId)) {
    // Map retired male voice Aarav to verified Indian male Raju, others to Tripti
    if (rawVoiceId === "pNInz6obpgDQGcFmaJgB" || rawVoiceId === "rajesh_hi") {
      return {
        provider: "elevenlabs",
        voiceId: "pzxut4zZz4GImZNlqQ3H",
        voiceName: "Raju - Natural Conversationalist",
        model: "eleven_turbo_v2_5",
      };
    }
    return {
      provider: "elevenlabs",
      voiceId: "1Z7Y8o9cvUeWq8oLKgMY",
      voiceName: "Tripti - Calm and Clear",
      model: "eleven_turbo_v2_5",
    };
  }

  const provider: "elevenlabs" | "sarvam" | "cartesia" | "polly" | "deepgram" =
    rawProvider.includes("polly")
      ? "polly"
      : rawProvider.includes("cartesia")
      ? "cartesia"
      : rawProvider.includes("deepgram")
      ? "deepgram"
      : "elevenlabs";

  const matched = CURATED_VOICE_REGISTRY.find((v) => v.voiceId === rawVoiceId);
  return {
    provider,
    voiceId: rawVoiceId,
    voiceName: params.voiceName || matched?.name || "Tripti - Calm and Clear",
    model: rawModel || matched?.model || "eleven_turbo_v2_5",
  };
}

export function getVisibleCuratedVoices(includeInDevelopment = true): CuratedVoiceEntry[] {
  return CURATED_VOICE_REGISTRY.filter(
    (v) => v.visible && (includeInDevelopment || v.status === "active")
  );
}
