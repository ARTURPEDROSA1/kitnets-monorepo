// Sentry for the Node.js runtime (route handlers, server components, server
// actions, crons). Loaded from src/instrumentation.ts. With no DSN configured
// (local dev, CI) Sentry stays disabled and this file is a no-op.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // 10% of requests get a performance trace; errors are always captured.
    tracesSampleRate: 0.1,
    // Never attach IPs, cookies or request bodies automatically.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    ignoreErrors: [
        // Clerk redirecting an anonymous user is not an error
        "NEXT_REDIRECT",
        "NEXT_NOT_FOUND",
    ],
});
