/**
 * PostHog facade.
 *
 * posthog-js is ~100 KB gzip; importing it statically put it in the main
 * bundle of every page and made it compete with the page's own work (and, on
 * the checkout, with Stripe). It is now loaded with a dynamic import AFTER the
 * page is idle (components/analytics/posthog-provider.tsx calls initPostHog).
 *
 * Callers use phCapture / phIdentify / phGroup, which are safe at any time:
 * before PostHog is ready the calls are queued (bounded) and flushed on init;
 * if it never loads (no key, internal user, blocked) they are no-ops — the same
 * outcome the old `if (posthog.__loaded)` guards produced.
 */
type PostHog = typeof import("posthog-js").default;

type Call = (ph: PostHog) => void;

const MAX_QUEUE = 30;
let instance: PostHog | null = null;
let queue: Call[] = [];
let started = false;

function run(call: Call) {
  if (instance) {
    try {
      call(instance);
    } catch {
      /* analytics is best-effort */
    }
  } else if (queue.length < MAX_QUEUE) {
    queue.push(call);
  }
}

export function phCapture(event: string, props?: Record<string, unknown>) {
  run((ph) => ph.capture(event, props));
}

export function phIdentify(userId: string, props?: Record<string, unknown>) {
  run((ph) => {
    if (ph.get_distinct_id?.() === userId) return;
    ph.identify(userId, props);
  });
}

export function phGroup(type: string, key: string) {
  run((ph) => ph.group(type, key));
}

/** Loads and initialises PostHog once. Resolves to the instance, or null. */
export async function initPostHog(
  key: string,
  host: string,
): Promise<PostHog | null> {
  if (instance) return instance;
  if (started) return null;
  started = true;
  const { default: posthog } = await import("posthog-js");
  if (!(posthog as { __loaded?: boolean }).__loaded) {
    posthog.init(key, {
      api_host: host,
      // SPA pageviews are captured manually (PageViewTracker).
      capture_pageview: false,
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: true, // never record what users type into forms
        maskTextSelector: "[data-private]",
      },
      respect_dnt: true,
    });
  }
  instance = posthog;
  const pending = queue;
  queue = [];
  for (const call of pending) run(call);
  return posthog;
}
