
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const locales = ["en", "pt", "es"];
const defaultLocale = "pt";

export default clerkMiddleware(async (auth, req) => {
    // 1. Check for Clerk Authentication on protected routes
    if (isProtectedRoute(req)) await auth.protect();

    // 2. Internationalization (i18n) Routing
    const { pathname } = req.nextUrl;

    // Skip if it's an API route or static file (already handled by config matcher mostly, but safety check)
    // Also skip if it's a Clerk internal route if any leak through, typically they don't with the matcher.

    // Check if the path already has a locale
    const pathnameHasLocale = locales.some(
        (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    );

    if (pathnameHasLocale) return;

    // If no locale, redirect to default locale
    const locale = defaultLocale;
    const newUrl = new URL(`/${locale}${pathname === "/" ? "" : pathname}`, req.url);

    return NextResponse.redirect(newUrl);
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
