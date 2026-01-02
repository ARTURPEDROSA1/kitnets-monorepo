"use client";

import Link from "next/link";
import { Instagram, Youtube } from "lucide-react";
import { getDictionary } from "../dictionaries";

export function Footer({ lang }: { lang?: string }) {
    const isDefaultLang = lang === "pt" || !lang;
    const legalHref = isDefaultLang ? "/aviso-legal" : `/${lang}/aviso-legal`;
    const termsHref = isDefaultLang ? "/termos-de-uso" : `/${lang}/termos-de-uso`;
    const privacyHref = isDefaultLang ? "/politica-de-privacidade" : `/${lang}/politica-de-privacidade`;
    const cookiesHref = isDefaultLang ? "/politica-de-cookies" : `/${lang}/politica-de-cookies`;
    const disclosureHref = isDefaultLang ? "/disclosure" : `/${lang}/disclosure`;

    const dict = getDictionary(lang || "pt");

    return (
        <footer className="w-full border-t border-border bg-background py-6">
            <div className="container mx-auto px-4 flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="flex items-center gap-4">
                    <a
                        href="https://www.instagram.com/kitnetz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-transform hover:scale-110 hover:text-foreground"
                        aria-label="Instagram"
                    >
                        <Instagram className="h-5 w-5" />
                    </a>
                    <a
                        href="https://www.youtube.com/@Kitnetz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-transform hover:scale-110 hover:text-foreground"
                        aria-label="YouTube"
                    >
                        <Youtube className="h-5 w-5" />
                    </a>
                </div>
                <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground md:justify-end">
                    <Link href={legalHref} className="hover:underline hover:text-foreground">{dict.footer.legalNotice}</Link>
                    <Link href={termsHref} className="hover:underline hover:text-foreground">{dict.footer.termsOfUse}</Link>
                    <Link href={privacyHref} className="hover:underline hover:text-foreground">{dict.footer.privacyPolicy}</Link>
                    <Link href={cookiesHref} className="hover:underline hover:text-foreground">{dict.footer.cookiePolicy}</Link>
                    <Link href={disclosureHref} className="hover:underline hover:text-foreground">{dict.footer.disclosure}</Link>
                </div>
            </div>
        </footer>
    );
}
