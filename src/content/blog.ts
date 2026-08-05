export interface BlogSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  excerpt: string;
  intro: string[];
  sections: BlogSection[];
}

/** Newest first — the index and sitemap both rely on this order. */
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "wedding-reception-low-light",
    title: "Wedding reception low light settings",
    description:
      "The aperture, shutter speed, and ISO ranges for shooting a dim reception hall, plus how to handle candlelight and uplighting without relying on flash.",
    publishedAt: "2026-08-05",
    excerpt:
      "Reception halls run dim, mixed, and fast-changing. Here's the aperture, shutter, ISO, and white-balance approach for candid coverage without blowing out faces with flash.",
    intro: [
      "A dim reception hall calls for an aperture of f/1.8 to f/2.8 for available-light candids, a shutter speed floor around 1/125s to 1/200s for posed and semi-posed shots, up around 1/500s if you're covering the dance floor, and ISO somewhere between 1600 and 6400 depending on how dark the room actually is once the sun goes down and the venue switches to its own lighting.",
      "The room only gets dimmer as the night goes on, so these aren't one-time settings, they're a range you'll move through all evening as natural window light gives way to candlelight and uplighting.",
    ],
    sections: [
      {
        heading: "Aperture: gathering enough light without losing your subject",
        paragraphs: [
          "f/1.8 to f/2.8 is the working range for reception candids on a fast prime, wide enough to pull in real light in a dim room and still isolate a subject from a busy background of tables and guests.",
          "For a formal group shot where everyone needs to be sharp, f/4 to f/5.6 keeps a small group in focus, though at that point you're usually adding light rather than opening wider, since a group shot at f/5.6 in reception-level light asks a lot of ISO alone.",
          "Coverage shot on a kit lens that tops out around f/4-5.6 loses real ground here, a stop or two versus f/1.8-2.8 glass right in the range where reception light matters most. On that kind of lens, leaning on bounce flash rather than pushing ISO alone is often the more reliable way to keep the dance floor usable, since there's a practical ceiling to how far ISO alone can compensate for a slower lens once the room goes fully dark.",
        ],
      },
      {
        heading: "Shutter speed: posed shots versus the dance floor",
        paragraphs: [
          "For posed and candid table shots, 1/125s to 1/200s is a safe floor that follows the reciprocal rule for the 35-85mm range most reception work happens in, and covers ordinary hand and head movement without a tripod.",
          "Once people start dancing, that's not enough. 1/500s or faster is what actually freezes a spin or a dip; going slower than that on the dance floor trades a sharp subject for a smear, which is only the right call if you're doing it on purpose for a motion-blur effect.",
        ],
      },
      {
        heading: "ISO: accepting some grain",
        paragraphs: [
          "A dim reception hall commonly meters around EV 2 to 4, noticeably darker than the EV 5 to 7 of an ordinarily lit room, which is exactly why the ISO has to climb as high as it does. Expect ISO 1600 to 3200 through most of a reasonably lit reception, and 3200 to 6400 once the room lighting drops for dancing or candles become the main light source.",
          "Resisting that climb to keep the file 'cleaner' is usually the wrong trade at a one-take event: a clean, blurry photo of a couple's first dance doesn't exist a second time, but a slightly grainy sharp one still does its job.",
          "A worked example: during dinner service in a moderately lit hall, f/2.0 at 1/125s commonly lands around ISO 2000 on a modern full-frame body, comfortably clean. Once the room lights dim for the first dance and uplighting becomes the main source, the same aperture and a faster 1/500s shutter to freeze movement can push the same camera to ISO 8000 or beyond, past where most bodies stay fully clean. At that point some visible grain in the file is simply the cost of a sharp, usable dance-floor shot rather than a smooth but blurred one.",
        ],
      },
      {
        heading: "White balance: candlelight versus uplighting",
        paragraphs: [
          "Candlelight sits around 1800-2000K, extremely warm, while venue uplighting is frequently set to a cooler LED color, sometimes matched to a wedding color scheme rather than anything close to neutral, and the two are often lighting the same table from different directions.",
          "No single white balance setting reads both correctly, which is the practical argument for shooting RAW through the reception: expose for the moment and correct color temperature per shot afterward, rather than trying to pick one in-camera setting that's right for the candle side of the table and wrong for the uplit side.",
        ],
      },
      {
        heading: "Common mistakes",
        paragraphs: [
          "Firing on-camera flash straight at a subject's face is the most visible mistake in reception photos. It flattens the scene and produces the harsh, flat look guests immediately recognize as a bad wedding photo; bouncing flash off a ceiling or wall, or skipping it in favor of a wider aperture and higher ISO, both read far more naturally.",
          "Keeping ISO artificially conservative to avoid grain is the second, at the cost of shutter speeds too slow for a room full of moving people. The third is setting exposure once early in the reception and not re-metering as the room dims through the evening, from natural window light at cocktail hour to candlelight and uplighting by the time the dancing starts.",
        ],
      },
      {
        heading: "When the first frame comes out wrong",
        paragraphs: [
          "Dark-but-sharp means there's ISO headroom you haven't used yet: raise it before touching shutter speed, since shutter speed is what's protecting the frame from a full dance-floor spin turning into a smear. A frame that's properly bright but soft everywhere, background included, usually means the shutter speed itself was too slow for handheld work in that light, not a focus miss.",
          "A frame where the room is sharp but the couple mid-spin isn't means the shutter speed was fine for the room, not for them, dance-floor subjects need their own faster floor regardless of how bright the shot looks overall. And a shot that looked fine on the camera's small LCD in a dark room but reads underexposed later is a preview problem, not an exposure problem, check the histogram at the reception, not just the screen.",
        ],
      },
      {
        heading: "As the night moves, so does the light",
        paragraphs: [
          "A reception's light changes more, and faster, than almost any other event you'll shoot: natural window light during cocktail hour, mixed candle and ambient room light through dinner, then a hard shift to uplighting and often a spotlight or gobo once dancing starts. Setting exposure once near the start of the night and assuming it holds is one of the more common ways a reception shoot goes wrong.",
          "Auto ISO with a fixed aperture and shutter speed, rather than fully manual, tracks these shifts without needing you to re-meter by hand between courses. You decide the aperture for how much of the table needs to be sharp and the shutter speed for how much movement you need to freeze, and let ISO absorb the swing as the room goes from daylight through windows to candlelight to dance-floor uplighting.",
        ],
      },
      {
        heading: "The exit shot",
        paragraphs: [
          "The sparkler or bubble send-off at the end of the night is different enough from the rest of the reception to deserve its own settings, since it usually happens outdoors or in a doorway well after the venue's own lighting has stopped being the main light source. If you want the couple sharp and the sparklers as distinct points of light rather than long trails, stay at the same fast shutter speed you used on the dance floor, 1/500s or faster, and let ISO climb further than it did indoors, sparkler light alone is dimmer than you'd expect once you're a few feet back.",
          "If instead you want the sparkler light drawn out into trails, that's the one moment in a reception shoot worth deliberately breaking the handheld shutter floor. A half-second to one-second exposure on a tripod or braced against a doorway, with guests told to hold reasonably still, produces the trailing-light effect most send-off photos are going for; handheld at that shutter speed just produces a blur of everything, not a trail of anything.",
        ],
      },
    ],
  },
  {
    slug: "night-street-photography-settings",
    title: "Night street photography settings",
    description:
      "The aperture, shutter speed, and ISO ranges for shooting handheld on city streets after dark, plus how to handle mixed streetlight color temperatures.",
    publishedAt: "2026-08-05",
    excerpt:
      "Handheld night street work lives or dies on shutter speed. Here's the aperture, ISO, and white-balance approach that actually holds up under sodium and LED streetlight.",
    intro: [
      "Night street photography is a handheld-shutter-speed problem before it's anything else. At a typical 24-35mm focal length, the floor for a sharp handheld shot is around 1/30s to 1/60s, following the rough rule of keeping your shutter speed at roughly 1/focal length; go slower than that without a wall or a rail to brace against and you'll see it in the file.",
      "Aperture usually sits between f/2.8 and f/5.6 depending on how much of the scene needs to stay sharp, and ISO does the rest, typically landing between ISO 800 and 3200 on a well-lit street, climbing toward 6400 in the darker stretches between streetlights.",
    ],
    sections: [
      {
        heading: "Aperture: how much of the frame needs to be sharp",
        paragraphs: [
          "If you're isolating a single figure under a streetlamp, f/2.8 gives you a shallow enough plane to separate them from the background while still letting in real light.",
          "If the shot depends on a layered street scene, a subject in the foreground and signage or architecture behind them both needing to read, f/5.6 to f/8 keeps more of the frame legible, at the cost of the ISO climbing higher to compensate. There's no single correct choice here; it's the same tradeoff as anywhere else, aperture for depth versus aperture for light, just with less light to spend either way.",
          "A kit zoom that only opens to f/3.5-5.6 costs you a stop or two versus a f/2.8 lens right where you need it most, so on that gear it's often worth deliberately choosing subjects under or near a light source rather than relying on ambient spill to reach them the way a faster lens can. In-body or lens stabilization narrows but doesn't close this gap, since it only buys back handholdability, not light.",
        ],
      },
      {
        heading: "Shutter speed: staying handholdable",
        paragraphs: [
          "The reciprocal rule, roughly 1/focal length, is the floor, not the target: 1/50s on a 50mm, 1/30s on a 24mm, faster again if your subject is moving rather than static.",
          "If your lens or body has stabilization, you can often go a couple of stops slower than that floor and still get a sharp static subject, though a moving pedestrian will still need real shutter speed regardless, since stabilization only compensates for camera shake, not subject motion. Bracing against a wall, a rail, or your own knee buys you real stops at that floor, for free.",
        ],
      },
      {
        heading: "ISO: how far you can push it",
        paragraphs: [
          "Expect ISO 800 to 1600 on a reasonably lit street with working streetlights and storefronts, and 1600 to 3200 as you move into dimmer side streets, with 6400 reserved for the darkest gaps or when you need a faster shutter for a moving subject more than you need a clean file.",
          "In exposure terms, a lit city street commonly falls around EV 4 to 6, several stops dimmer than the EV 12 you'd read in open shade at midday and further still from the EV 15 of direct sun, which is the entire reason night street work runs at ISOs you'd rarely touch in daylight.",
          "A worked example: on a well-lit block with working streetlights and a lit storefront or two, 1/50s at f/2.8 on a 35mm lens commonly lands around ISO 1600 on a modern body, a genuinely clean file. Walk two blocks into a residential side street with sparser lighting and the same shutter speed and aperture can push the meter to ISO 6400 for the same brightness, at which point grain becomes visible even on a good sensor. Rather than fight that by slowing the shutter further, past your handholdable floor, it's usually the better trade to accept the grain, night street work reads as gritty rather than flawed, and a slightly noisy sharp frame still works; a smooth but blurred one doesn't.",
        ],
      },
      {
        heading: "White balance in mixed streetlight",
        paragraphs: [
          "Sodium vapor streetlights, LED replacements, neon signage, and lit shopfronts rarely share a color temperature, sometimes within the same frame, so Auto White Balance will make a different guess shot to shot as your framing shifts between light sources.",
          "Shooting RAW is the practical fix: expose for the scene and correct color temperature afterward, rather than trying to lock a single white balance setting that has to be right for streetlight, neon, and ambient sky all at once. If you do want to commit to a setting in-camera, a Tungsten or custom setting around 3000K usually reads closer to natural than Auto under sodium-heavy streetlight, though it will shift anything lit by daylight-balanced LEDs toward blue.",
        ],
      },
      {
        heading: "When autofocus won't lock",
        paragraphs: [
          "In the darkest stretches between streetlights, autofocus can start hunting rather than locking, especially on lenses that rely on contrast-detect focus or on a subject with low contrast against its background. Switching to manual focus and pre-focusing on a spot you expect your subject to reach, a doorway, a crosswalk, the edge of a pool of streetlight, is often more reliable than waiting on autofocus to catch up in that light.",
          "If your camera has a focus-assist beam or a peaking display, turning it on for this kind of shooting is worth the slightly more clinical live-view image it produces. A single focus point placed deliberately on your subject also outperforms wide-area autofocus here, since a wide autofocus area is more likely to lock onto whatever high-contrast edge is nearest, a lit sign, a passing headlight, rather than the person you actually want sharp.",
        ],
      },
      {
        heading: "Common mistakes",
        paragraphs: [
          "Underexposing to protect blown highlights around bright signs is the most common one. It feels like the safe choice, but it buries shadow detail that's much harder to recover than a slightly clipped highlight, especially once you're already at ISO 3200 or higher where the shadows are noisy to begin with.",
          "Chasing a lower ISO by dropping shutter speed below the handholdable floor is the second, and it trades a clean file for a soft one, which is rarely the better trade. The third is skipping stabilization technique entirely because the lens or body already has stabilization; bracing still buys real stops on top of whatever the gear is doing for you.",
        ],
      },
      {
        heading: "When the first frame comes out wrong",
        paragraphs: [
          "A shot that's dark but sharp means you have ISO headroom left, bump it and reshoot rather than dropping shutter speed below the handholdable floor. A shot that's bright but everything, including static architecture, is soft usually means the shutter speed itself was too slow for a handheld frame, that's a shutter problem, not a focus one.",
          "A shot where a static background is sharp but a walking pedestrian is a smear means the shutter speed was adequate for you, not for them, subject motion needs its own, usually higher, shutter speed regardless of how steady your hands were. And a shot that looks fine on the camera's LCD but disappointing later is often just the LCD reading brighter than the file actually is in the dark; trust the histogram over the preview.",
        ],
      },
      {
        heading: "As you move down the block, the light changes too",
        paragraphs: [
          "The same walk down one street can cross through several very different lighting situations, a bright intersection under multiple streetlights, a dim mid-block stretch, a neon-lit storefront, sometimes within fifty feet of each other. Re-metering at every step isn't practical if you're shooting candidly.",
          "Auto ISO with a fixed shutter speed and aperture is the more usable setup for a walk rather than a single spot: you lock in the shutter speed the handholdable floor and your subject's motion require, pick the aperture for the depth of field you want, and let ISO track the swings in ambient light as you move block to block. Recheck your histogram periodically rather than assuming the exposure that worked at the last corner still holds two storefronts later.",
        ],
      },
    ],
  },
  {
    slug: "camera-settings-indoor-sports",
    title: "Camera settings for indoor sports",
    description:
      "The ISO, aperture, and shutter speed ranges that actually freeze indoor sports action, plus the white balance approach gym lighting requires.",
    publishedAt: "2026-08-05",
    excerpt:
      "Indoor sports means not enough light and a subject that won't hold still. Here's the shutter, aperture, ISO, and white-balance order that actually works courtside.",
    intro: [
      "Indoor sports give you two problems at once: not enough light, and a subject that won't hold still. The starting point is shutter speed, not ISO. Set 1/500s for kids' games and recreational leagues, 1/1000s or faster for competitive play or anything airborne, a volleyball spike, a basketball at the rim, a puck off a stick.",
      "Everything else, aperture and ISO, exists to make that shutter speed usable in a room that's nowhere near as bright as it looks to your eyes. Gyms and indoor courts vary enormously in how much light they actually put out, from well-lit modern arenas to church-basement leagues lit by a handful of fluorescent tubes, so there's no single ISO number that works everywhere. What's consistent is the order you solve it in: lock the shutter speed the action demands, open the aperture as wide as your lens goes, and let ISO absorb whatever's left.",
    ],
    sections: [
      {
        heading: "Shutter speed: freezing the action",
        paragraphs: [
          "A walking or jogging player is comparable to a walking pedestrian on the street, around 1/125s keeps them sharp. Once players are sprinting, cutting, or the ball itself is in flight, that's not enough; 1/500s is the realistic floor for most youth and recreational indoor sports, and 1/1000s or higher is where you want to be for varsity-level speed or anything airborne close to the camera.",
          "The faster the subject crosses your frame rather than moving toward or away from you, the more shutter speed it costs you, a player crossing the free-throw lane needs several times the shutter speed of one driving straight at the basket, commonly reckoned at around four times as much.",
        ],
      },
      {
        heading: "Aperture: give the lens everything it has",
        paragraphs: [
          "Indoor sports is one of the few situations where you almost never stop down. Shoot at your lens's widest aperture, typically f/1.8 to f/2.8 on the fast primes and zooms suited to this kind of shooting, because every stop you close down is light you don't have to spare.",
          "The tradeoff is depth of field: at f/1.8 with a telephoto zoom, your focus margin on a moving player can be a matter of inches, so autofocus tracking matters more than usual. Shooting a fast zoom at f/2.8 instead of a prime at f/1.8 trades a stop and a half of light for a slightly more forgiving focus plane; which one is worth it depends on how reliably your camera's tracking locks onto a moving subject.",
          "A kit zoom that tops out at f/4.5-5.6 at the telephoto end simply doesn't have the aperture budget for this the way a fast prime does. If that's what you're shooting with, plan on ISO climbing an extra stop or two higher than the ranges below, or on shooting closer to the action so a shorter focal length and its wider available aperture is enough.",
        ],
      },
      {
        heading: "ISO: the number that has to move",
        paragraphs: [
          "With shutter speed fixed by the action and aperture fixed by the lens, ISO is what's left to balance the exposure, and in a typical gym that lands somewhere between ISO 1600 and 6400. Well-lit modern facilities can stay closer to 1600-3200; older gyms and church-basement courts lit by a handful of fluorescent tubes will push you toward 6400 or beyond.",
          "In exposure value terms, most indoor gyms fall somewhere between EV 3 and EV 6, a stop or two dimmer than a well-lit living room, which typically meters around EV 5 to 7. Don't fight this by dropping your shutter speed to keep ISO lower; a clean, blurry photo is a worse outcome than a slightly grainy sharp one, and modern sensors handle ISO 6400 far better than they handle motion blur.",
          "A worked example: shooting a rec-league basketball game under fluorescent lighting, you set 1/1000s to freeze a fast break and f/2.8 because that's as wide as your 70-200mm zoom goes. The camera's meter lands on ISO 5000 for a correct exposure. On a modern full-frame body that's a genuinely clean, usable file; on an older APS-C body from five or six years ago, ISO 5000 already shows visible noise in the shadows under the basket. The fix isn't to drop the ISO by slowing the shutter, since that trades noise for blur, it's to open up further if your lens allows it, f/2.0 or f/1.8 on a prime, which buys back a stop or more and can drop that same shot to ISO 2500, a meaningfully cleaner file on the same body.",
        ],
      },
      {
        heading: "White balance under gym lighting",
        paragraphs: [
          "Gyms are rarely lit by one light source. It's common to have older sodium or metal-halide fixtures mixed with newer LED replacements in the same ceiling, each with a different color temperature, which is why a single white balance preset often looks right under one basket and off under the other.",
          "If your camera has a custom white balance function, take a test shot of something neutral-colored courtside under the lighting you'll actually be shooting under and set from that, rather than trusting Auto White Balance to guess consistently shot to shot. Shooting RAW gives you a second chance to correct this after the fact if you don't have time to set a custom white balance before tip-off.",
        ],
      },
      {
        heading: "Common mistakes",
        paragraphs: [
          "The most common mistake is capping Auto ISO too low to 'keep the file clean' and ending up with a shutter speed the camera can't hit, which trades noise for blur, the worse of the two.",
          "A close second is trusting the exposure that looks fine on the camera's LCD in a dark gym; screens read brighter than they should in low ambient light, so a photo that looks properly exposed courtside can be a stop or more underexposed once you view it somewhere brighter. Check the histogram, not just the preview. The third is treating panning technique, which works well outdoors for a runner or a car, as a fallback for insufficient light indoors; panning trades a sharp subject for a blurred background on purpose, and it's a stylistic choice, not a substitute for the shutter speed your subject actually needs.",
        ],
      },
      {
        heading: "When the first frame comes out wrong",
        paragraphs: [
          "If a shot comes back dark, check which of the three you actually have room to move before assuming you need a flash or a faster lens. A dark but sharp frame usually means the meter erred toward safety, or Auto ISO was capped, bump the ISO ceiling and reshoot before touching shutter speed, since shutter speed is what's protecting you from motion blur in the first place.",
          "If instead the frame is blurry rather than dark, that's a different problem with a different fix: motion blur across the whole frame, background included, means the shutter speed itself is too slow for the action; blur that's isolated to the player while the background stays sharp usually means autofocus didn't track, which no shutter speed change will fix, that's a focus-mode or lens problem, not an exposure one. Chimping the LCD after a make-or-break play doesn't tell you which of these happened; check the histogram for exposure and zoom into the actual player, not the background, to check focus.",
        ],
      },
      {
        heading: "As the game moves, the light does too",
        paragraphs: [
          "Gym lighting is rarely even end to end. A lot of facilities run fewer fixtures, or older fixtures, over one basket than the other, so the correct ISO for a shot under one hoop can be a stop or more different from the same shot at the opposite end, and a team switching ends at halftime means your settings should too. Evening rec league games in gyms with skylights or high windows are their own case: natural light contributes noticeably at 6pm and is gone by 7:30, so a setting that was correct at tip-off can leave you underexposed by the fourth quarter if you don't recheck it.",
          "Auto ISO with a fixed shutter speed and aperture, rather than fully manual exposure, is the practical way to keep up with this without re-metering by hand between every possession; you set the two numbers that matter for freezing motion and depth of field, and let the camera track the one number that's actually moving on you.",
        ],
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
