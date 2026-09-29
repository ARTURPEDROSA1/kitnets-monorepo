import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isCrawlerQueryTrap } from "@/lib/crawler-guard";

const locales = ["en", "pt", "es"];
const defaultLocale = "pt";

// Every page lives under /[lang]/…, so the matcher must accept an optional
// locale prefix. A plain "/dashboard(.*)" pattern never matched "/pt/dashboard"
// and left the whole authenticated area unprotected at the edge.
const PROTECTED_SEGMENTS = [
    "dashboard",
    "imobiliaria",
    "corretores",
    "profile",
    "proprietario",
    "imoveis",
    "inquilinos",
    "contratos",
    "condominio",
    "contabil",
    "onboarding",
];
const isProtectedRoute = createRouteMatcher([
    new RegExp(`^(/(${locales.join("|")}))?/(${PROTECTED_SEGMENTS.join("|")})(/.*)?$`),
]);

export default clerkMiddleware(async (auth, req) => {
    // 1. Check for Clerk Authentication on protected routes
    if (isProtectedRoute(req)) await auth.protect();

    // 2. Internationalization (i18n) Routing
    const { pathname } = req.nextUrl;

    // Skip if it's an API route or static file (already handled by config matcher mostly, but safety check)
    // Also skip if it's a Clerk internal route if any leak through, typically they don't with the matcher.

    // Skip API routes and the Sentry tunnel (see tunnelRoute in next.config.ts)
    if (pathname.startsWith('/api') || pathname.startsWith('/trpc') || pathname.startsWith('/monitoring')) {
        return;
    }

    // Check if the path already has a locale
    const pathnameHasLocale = locales.some(
        (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    );

    // Crawlers get the canonical FipeZAP city page, never its endless query variants (src/lib/crawler-guard.ts)
    if (isCrawlerQueryTrap(pathname, req.nextUrl.search, req.headers.get("user-agent"))) {
        const canonical = new URL(pathnameHasLocale ? pathname : `/${defaultLocale}${pathname}`, req.url);
        canonical.search = "";
        return NextResponse.redirect(canonical, 301);
    }

    if (pathnameHasLocale) return;

    // If no locale, redirect to default locale
    const locale = defaultLocale;
    const newUrl = new URL(`/${locale}${pathname === "/" ? "" : pathname}`, req.url);
    newUrl.search = req.nextUrl.search;   // deep links (?id=, ?property=) survive the redirect

    return NextResponse.redirect(newUrl);
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params.
        // txt keeps /robots.txt out of the locale redirect (it went to /pt/robots.txt, a 404).
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
