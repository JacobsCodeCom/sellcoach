/** Demo store for the Mira extension / landing promo videos. */

const now = Date.now();
const deskUrl = "http://localhost:3000/promo/desk.html";

function momentSvg({ title, line1, line2, badge }) {
  // No empty left rail — that reads as a black bar in stills/video.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
  <rect width="720" height="420" fill="#f3f5f7"/>
  <rect width="200" height="420" fill="#ffffff" stroke="#e3e6ea"/>
  <text x="16" y="36" font-family="Segoe UI, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#1a1d21">Your inbox</text>
  <rect x="12" y="56" width="176" height="72" rx="8" fill="#eaf3fb"/>
  <text x="24" y="78" font-family="Segoe UI, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#1a1d21">Maya Chen</text>
  <text x="24" y="98" font-family="Segoe UI, Helvetica, sans-serif" font-size="11" fill="#68737d">Alpine Health · churn</text>
  <rect x="200" width="520" height="420" fill="#ffffff"/>
  <text x="220" y="40" font-family="Segoe UI, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#1a1d21">${title}</text>
  <rect x="560" y="22" width="140" height="24" rx="12" fill="#fff0f1"/>
  <text x="630" y="38" text-anchor="middle" font-family="Segoe UI, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#cc3340">${badge}</text>
  <rect x="220" y="64" width="460" height="70" rx="10" fill="#ffffff" stroke="#e3e6ea"/>
  <text x="236" y="92" font-family="Segoe UI, Helvetica, sans-serif" font-size="13" fill="#2f343b">${line1}</text>
  <text x="236" y="114" font-family="Segoe UI, Helvetica, sans-serif" font-size="13" fill="#68737d">${line2}</text>
  <rect x="220" y="150" width="460" height="90" rx="10" fill="#fffaf0" stroke="#f3d9a8"/>
  <text x="236" y="178" font-family="Segoe UI, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#ad6800">Internal note · Jordan Lee</text>
  <text x="236" y="202" font-family="Segoe UI, Helvetica, sans-serif" font-size="12" fill="#2f343b">Two cancel mentions → escalate. Competitor same day.</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const moment = (id, t, title, line1, line2, badge) => ({
  id,
  t,
  url: deskUrl,
  image: momentSvg({ title, line1, line2, badge }),
});

const workMap = {
  title: "Handle a churn-risk account",
  confirmed: true,
  teachBack:
    "Open the account, check for repeat cancellation signals, escalate competitor comparisons the same day, and send a same-day recap after a failed onboarding call.",
  openQuestions: [],
  corrections: [],
  guardrails: [
    {
      id: "g1",
      type: "limit",
      rule: "Escalate if cancellation is mentioned twice in one week.",
      quote: "Escalate if they mention cancellation twice in one week.",
      t: 12,
      momentId: "m1",
    },
    {
      id: "g2",
      type: "stop_and_ask",
      rule: "Same-day escalate any competitor comparison question.",
      quote: "Competitor comparison always goes up the same day.",
      t: 28,
      momentId: "m2",
    },
  ],
  steps: [
    {
      id: "s1",
      title: "Open the priority account",
      t: 5,
      momentId: "m1",
      screen: "Priority inbox with Alpine Health highlighted",
      decision: "Start with the hottest churn-risk ticket, not the oldest one.",
      isJudgmentCall: true,
      reason: "Repeat cancellation mentions beat FIFO when retention is on the line.",
      reasonSource: "live",
      guardrailIds: ["g1"],
      pageUrl: deskUrl,
    },
    {
      id: "s2",
      title: "Check cancellation signals",
      t: 18,
      momentId: "m1",
      screen: "Account timeline showing two cancellation mentions",
      decision: "Confirm the two-mention threshold before escalating.",
      isJudgmentCall: false,
      reason: "The rule is two mentions in one week — count them first.",
      reasonSource: "live",
      guardrailIds: ["g1"],
      pageUrl: deskUrl,
    },
    {
      id: "s3",
      title: "Escalate competitor comparison",
      t: 32,
      momentId: "m2",
      screen: "Ticket note asking how you compare to a competitor",
      decision: "Route to lead the same day — do not answer alone.",
      isJudgmentCall: true,
      reason: "Competitor talk needs a tighter story than a solo reply.",
      reasonSource: "live",
      guardrailIds: ["g2"],
      pageUrl: deskUrl,
    },
    {
      id: "s4",
      title: "Send the failed-call recap",
      t: 48,
      momentId: "m3",
      screen: "Draft email with three next steps and a booking link",
      decision: "Same-day recap; never wait for the customer to follow up.",
      isJudgmentCall: false,
      reason: "Silence after a failed call is how deals go cold.",
      reasonSource: "live",
      guardrailIds: [],
      pageUrl: deskUrl,
    },
  ],
};

const capture = {
  id: "cap_promo_jordan",
  companyId: "co_acme",
  memberId: "mem_jordan",
  workRoleId: "wr_expert",
  startedAt: now - 86_400_000,
  endedAt: now - 86_300_000,
  publishedAt: now - 86_200_000,
  events: [],
  teachBacks: [],
  guardrails: [],
  mapSteps: [],
  workMap,
  moments: [
    moment(
      "m1",
      5,
      "Alpine Health · churn risk",
      "Customer mentioned cancellation twice this week.",
      "Hottest ticket in the priority inbox.",
      "Cancel ×2",
    ),
    moment(
      "m2",
      32,
      "Alpine Health · competitor ask",
      "How do you compare to Northstar on support SLAs?",
      "Jordan escalates competitor talk the same day.",
      "Escalate today",
    ),
    moment(
      "m3",
      48,
      "Failed-call recap draft",
      "Three next steps + booking link, sent before leaving desk.",
      "Same-day recap keeps the deal warm.",
      "Recap",
    ),
  ],
  transcript: [
    { t: 4, who: "expert", text: "I'm opening Alpine first — two cancellation mentions this week." },
    { t: 20, who: "expert", text: "That's the threshold, so this escalates." },
    { t: 34, who: "expert", text: "Competitor comparison goes to my lead the same day." },
    { t: 50, who: "expert", text: "And I send the failed-call recap before I leave the desk." },
  ],
};

const lesson = {
  id: "les_promo_churn",
  companyId: "co_acme",
  sourceCaptureId: capture.id,
  sourceMemberId: "mem_jordan",
  sourceWorkRoleId: "wr_expert",
  title: workMap.title,
  summary: "4 steps · 2 judgment calls · 2 rules",
  prompt: `Walk through ${workMap.title}, then handle cases you haven't seen.`,
  passCriteria: workMap.guardrails.map((g) => g.rule).join(" "),
  orderHint: capture.startedAt,
  status: "active",
  createdAt: now - 86_100_000,
  kind: "workmap",
  estimateMinutes: 8,
};

const roadmap = {
  id: "rm_alex",
  companyId: "co_acme",
  membershipId: "mem_alex",
  workRoleId: "wr_junior",
  updatedAt: now - 86_000_000,
  items: [{ lessonId: lesson.id, status: "available", order: 0 }],
};

export function buildPromoStore(opts = {}) {
  const sessionUserId = opts.sessionUserId || "usr_alex";
  return {
    sessionUserId,
    activeCompanyId: "co_acme",
    users: [
      { id: "usr_owner", email: "sam@acme.demo", name: "Sam Owner", createdAt: 1 },
      { id: "usr_jordan", email: "jordan@acme.demo", name: "Jordan Lee", createdAt: 2 },
      { id: "usr_alex", email: "alex@acme.demo", name: "Alex Rivera", createdAt: 3 },
    ],
    companies: [
      {
        id: "co_acme",
        name: "Acme Ops",
        summary: "B2B customer success team learning from senior playbooks.",
        createdAt: 1,
        ownerUserId: "usr_owner",
        onboardingComplete: true,
      },
    ],
    memberships: [
      {
        id: "mem_owner",
        userId: "usr_owner",
        companyId: "co_acme",
        platformRole: "owner",
        workRoleId: "wr_expert",
        createdAt: 1,
      },
      {
        id: "mem_jordan",
        userId: "usr_jordan",
        companyId: "co_acme",
        platformRole: "member",
        workRoleId: "wr_expert",
        createdAt: 2,
      },
      {
        id: "mem_alex",
        userId: "usr_alex",
        companyId: "co_acme",
        platformRole: "member",
        workRoleId: "wr_junior",
        newHire: true,
        createdAt: 3,
      },
    ],
    workRoles: [
      {
        id: "wr_expert",
        companyId: "co_acme",
        title: "Customer success",
        seniority: 4,
        competence: "expert",
        createdAt: 1,
      },
      {
        id: "wr_junior",
        companyId: "co_acme",
        title: "Customer success",
        seniority: 1,
        competence: "junior",
        createdAt: 2,
      },
    ],
    captures: [capture],
    lessons: [lesson],
    roadmaps: [roadmap],
    agents: [
      {
        id: "ag_promo_cs",
        companyId: "co_acme",
        name: "CS desk agent",
        brief: "Runs confirmed Work Map steps; stops on guardrails and asks a human.",
        workRoleId: "wr_expert",
        status: "draft",
        createdAt: now - 85_000_000,
      },
    ],
    abilities: [
      {
        id: "ab_promo_churn",
        agentId: "ag_promo_cs",
        companyId: "co_acme",
        name: "Handle churn-risk triage",
        sourceCaptureId: capture.id,
        sourceLessonId: lesson.id,
        trigger: "manual",
        triggerDescription: "",
        notes: "Permission = confirmed Work Map. Judgment calls stay with people.",
        extraGuardrails: [],
        enabled: true,
        createdAt: now - 84_900_000,
      },
    ],
    abilityRuns: [],
    integrationConnections: [],
    externalPeople: [],
    knowledgeTopics: [],
    captureTasks: [],
    invites: [],
  };
}
