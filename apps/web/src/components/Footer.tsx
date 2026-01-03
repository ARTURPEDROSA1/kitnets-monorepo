"use client";

import Link from "next/link";
import { Instagram, Youtube, Facebook } from "lucide-react";
import { Dictionary } from "../dictionaries";

export function Footer({ lang, dict }: { lang?: string; dict: Dictionary }) {
    const isDefaultLang = lang === "pt" || !lang;
    const legalHref = isDefaultLang ? "/aviso-legal" : `/${lang}/aviso-legal`;
    const termsHref = isDefaultLang ? "/termos-de-uso" : `/${lang}/termos-de-uso`;
    const privacyHref = isDefaultLang ? "/politica-de-privacidade" : `/${lang}/politica-de-privacidade`;
    const cookiesHref = isDefaultLang ? "/politica-de-cookies" : `/${lang}/politica-de-cookies`;
    const disclosureHref = isDefaultLang ? "/disclosure" : `/${lang}/disclosure`;

    return (
        <footer className="w-full border-t border-border bg-background py-6">
            <div className="container mx-auto px-4 flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="flex items-center gap-4">
                    <a
                        href="https://www.facebook.com/Kitnetz/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-transform hover:scale-110 hover:text-foreground"
                        aria-label="Facebook"
                    >
                        <Facebook className="h-5 w-5" />
                    </a>
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
                    <a
                        href="https://x.com/KitnetsIA"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-transform hover:scale-110 hover:text-foreground"
                        aria-label="X"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-5 w-5"
                        >
                            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                        </svg>
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
