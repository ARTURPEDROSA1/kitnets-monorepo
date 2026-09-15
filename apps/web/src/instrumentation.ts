// Next.js instrumentation hook: initialises Sentry for the server runtimes and
// forwards every unhandled server error (route handlers, server components,
// server actions, middleware) to it.
import * as Sentry from "@sentry/nextjs";

export async function register() {
    // Fail on boot, with every problem listed, rather than on the first request.
    await import("./lib/env");
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("../sentry.server.config");
    }
    if (process.env.NEXT_RUNTIME === "edge") {
        await import("../sentry.edge.config");
    }
}

export const onRequestError = Sentry.captureRequestError;
