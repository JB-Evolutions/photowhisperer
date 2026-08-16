export interface FaqItem {
  question: string;
  answer: string;
}

/** Both FAQ arrays live here so drift between them is visible in one file.
 *
 *  Each array is rendered by FaqAccordion AND emitted as FAQPage JSON-LD from
 *  this same source on its page, so copy and structured data can't diverge.
 *
 *  Keep the split strict: HOME_FAQ_ITEMS covers product basics and the
 *  billing/policy questions a broad visitor asks (how requests work, what
 *  happens at the limit, cancel/change plans). PRICING_FAQ_ITEMS covers only
 *  what's specific to comparing tiers. Topical overlap between them means two
 *  pages emitting competing FAQPage schema. */

export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    question: "What counts as one request?",
    answer:
      "Each scene you describe that returns a settings card. Refinements (\"same scene but darker mood\") count as a new request. Clarifying questions we ask you don't count — if we need more info before we can answer, that one's free.",
  },
  {
    question: "What happens if I don't use all my requests in a month?",
    answer:
      "Monthly requests don't roll over. Your allowance resets on the 1st of each month (UTC). Extra credit packs are different — those never expire and carry over indefinitely.",
  },
  {
    question: "What happens when I run out?",
    answer:
      "You can buy an extra credit pack or upgrade your plan. Credits are only used once your monthly allowance is gone, so you never burn a paid credit while you still have free requests left.",
  },
  {
    question: "What does a good prompt look like?",
    answer:
      "The more you tell us about light, subject, and movement, the better the answer. \"Indoor wedding reception, dim tungsten light, guests dancing, 50mm f/1.8, no flash\" gets you exact ISO, aperture, shutter speed and white balance, plus the assumptions we made and any warnings (like motion blur risk). \"Help with photos\" doesn't — we'll ask you a follow-up instead.",
  },
  {
    question: "Do I need to understand exposure math?",
    answer:
      "No. Describe the scene in plain language and we'll do the calculation. Every answer shows its reasoning, so you can learn the math if you want to — but you don't need it to get a usable result.",
  },
  {
    question: "Will it work with my camera?",
    answer:
      "Any camera with manual or semi-manual controls — mirrorless, DSLR, film, or a phone with a pro mode. Add your body and lenses to your camera profile and we'll keep every answer inside what your gear can actually do.",
  },
  {
    question: "Can I cancel or change plans?",
    answer:
      "Yes, anytime from your billing page. Changes take effect at the end of your current billing period, and you keep full access until then. No cancellation fee, no email required.",
  },
  {
    question: "What do you do with my data?",
    answer:
      "We store the scenes you describe and the settings we return, so you can revisit past sessions. We never upload or process your actual photographs. Snapshot keeps your last 3 sessions; paid plans keep all of them.",
  },
];

export const PRICING_FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Snapshot free forever?",
    answer:
      "Snapshot is a trial, not a long-term free plan. Five requests a month is enough to see whether the answers are worth paying for — if you shoot regularly you'll hit the cap quickly.",
  },
  {
    question: "Are the monthly limits hard caps?",
    answer:
      "Yes. We don't bill you for overage. When you hit your monthly allowance you choose what happens next: buy a credit pack or move up a plan.",
  },
  {
    question: "How do extra credit packs work?",
    answer:
      "One-time purchase, never expire. They sit behind your monthly allowance and are only drawn down once that allowance is gone.",
  },
  {
    question: "What's the difference between Portrait and Studio?",
    answer:
      "Volume only — 500 requests a month on Portrait versus 2,000 on Studio. History, camera profile editing, and extra-credit packs are the same on both.",
  },
];
