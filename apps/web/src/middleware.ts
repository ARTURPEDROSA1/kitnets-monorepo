import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

let locales = ["en", "pt", "es"];
let defaultLocale = "pt";

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Check if there is any supported locale in the pathname
    const pathnameHasLocale = locales.some(
        (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    );

    if (pathnameHasLocale) {
        // If the path starts with /pt, redirect to / (canonicalize)
        if (pathname.startsWith(`/${defaultLocale}/`) || pathname === `/${defaultLocale}`) {
            const newPath = pathname.replace(`/${defaultLocale}`, "") || "/";
            return NextResponse.redirect(new URL(newPath, request.url));
        }
        return;
    }

    // If no locale, rewrite to default locale (pt)
    // This allows the [lang] folder to handle the request properly
    return NextResponse.rewrite(
        new URL(`/${defaultLocale}${pathname}`, request.url)
    );
}

export const config = {
    matcher: [
        // Skip all internal paths (_next)
        "/((?!_next|favicon.ico|kitnets-logo.png|.*\\..*).*)",
    ],
};
