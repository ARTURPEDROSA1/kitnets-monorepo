// Sentry for the browser. Next.js loads this file on the client before the
// app hydrates. No-op without a DSN. Session Replay is deliberately not
// enabled: the dashboard shows tenants' personal data and contracts.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    ignoreErrors: [
        // Browser noise that is not actionable
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        /Loading chunk [\d]+ failed/,
        /Failed to fetch dynamically imported module/,
        "AbortError",
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
