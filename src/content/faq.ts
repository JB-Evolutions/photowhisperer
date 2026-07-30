export interface FaqItem {
  question: string;
  answer: string;
}

/** Both FAQ arrays live here so drift between them is visible in one file.
 *
 *  Each array is rendered by FaqAccordion AND emitted as FAQPage JSON-LD from
 *  this same source on its page, so copy and structured data can't diverge.
 *
 *  Keep the split strict: HOME_FAQ_ITEMS is search intent (discovery),
 *  PRICING_FAQ_ITEMS is commercial/billing (conversion). Topical overlap
 *  between them means two pages emitting competing FAQPage schema. */

export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    question: "Does this work with my camera?",
    answer:
      "Yes. PhotoWhisperer gives you settings in standard terms (ISO, aperture, shutter speed, white balance) that apply to any camera that shoots in manual mode, mirrorless, DSLR, or otherwise. We don't connect to your camera directly; you read the values and dial them in yourself.",
  },
  {
    question: "What ISO should I use at night or in low light?",
    answer:
      "For most low light you're between ISO 800 and 6400: roughly 800-1600 for a lit city street, 1600-3200 for a dim indoor reception, and 3200-6400 for candlelight or a handheld night scene. Push past 6400 only when you need the shutter speed more than you need a clean file, since noise climbs fast up there on smaller sensors. How high you actually go depends on how much motion you have to stop, so we solve the ISO against your aperture and shutter speed rather than handing you a fixed preset.",
  },
  {
    question: "Is this good for beginners who don't know manual mode yet?",
    answer:
      "Yes. The fastest way in is to set your aperture first for the look you want, keep your shutter speed at roughly 1/focal length to avoid handshake blur (about 1/50s on a 50mm, 1/200s on a 200mm, and a couple of stops slower if your lens or body has stabilisation), and let ISO make up the difference. You don't need to know stops or the exposure triangle to start; we hand back all four values with the reasoning attached, so you pick up the logic by watching it applied to scenes you actually shoot.",
  },
  {
    question: "What shutter speed do I need to freeze motion?",
    answer:
      "A walking person needs about 1/125s, kids or a running dog about 1/500s, and fast sport or birds in flight 1/1000s or higher. Subjects crossing the frame need several times the shutter speed of subjects moving toward you, commonly reckoned at around four times, and panning goes the other way, down to 1/30-1/60s, to keep the background streaked while the subject stays sharp. Those numbers assume you have the light to support them, which is the part we solve: balancing the shutter speed you need against the ISO and aperture your scene can actually afford.",
  },
  {
    question: "What aperture should I use for portraits versus landscapes?",
    answer:
      "Portraits usually sit between f/1.8 and f/2.8 for one subject with a soft background, opening to f/4 or f/5.6 for a couple or a group so everyone stays sharp. Landscapes typically land at f/8 to f/11, which is also where most lenses are at their sharpest, and f/16 when you need detail from a foreground rock all the way to the horizon. Depth of field shifts with focal length and how close you're standing, so we work the aperture against your lens and distance instead of a single fixed number.",
  },
  {
    question: "What is the exposure triangle?",
    answer:
      "The exposure triangle is ISO, aperture, and shutter speed, the three controls that together set how bright your photo is. They trade against each other in stops: open the aperture one stop and you can cut the exposure time in half, 1/125s to 1/250s, or halve the ISO, and land at the same exposure. To anchor it to real light, bright sun is about EV 15 (the sunny 16 rule, f/16 at 1/ISO), open shade about EV 12, and a lit indoor room EV 5 to 7, each step down being one stop less light. We solve that trade for your scene and show which of the three we prioritised and why.",
  },
  {
    question: "Do you store my data?",
    answer:
      "Your scene descriptions and the settings we return are stored so you can revisit your history. You control how much of that history you keep. Stripe handles payments, Supabase stores your account data, and Anthropic processes the scene description itself to generate your settings. We don't share any of it for model training.",
  },
];

export const PRICING_FAQ_ITEMS: FaqItem[] = [
  {
    question: "What counts as one setting?",
    answer:
      "One setting is one scene description you submit that returns one set of camera values. Each request counts once toward your monthly limit, whether or not you end up using the result.",
  },
  {
    question: "What happens if I run out?",
    answer:
      "Buy extra credits anytime, or upgrade your plan for a higher monthly limit.",
  },
  {
    question: "Do my unused requests roll over?",
    answer:
      "No. Your monthly settings reset on the 1st of the month UTC and unused ones do not roll over. Extra credits you purchase work differently: they roll over and never expire.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel your subscription anytime from your billing page. You'll keep access through the end of your current billing period, no penalties, no retention calls.",
  },
  {
    question: "Can I downgrade?",
    answer:
      "Yes, via the customer portal. Your downgrade takes effect at the end of your current billing period.",
  },
];
