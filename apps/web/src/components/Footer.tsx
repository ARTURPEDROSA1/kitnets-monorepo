"use client";

import Link from "next/link";
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
            <div className="container mx-auto px-4">
                <div className="flex flex-wrap justify-center gap-4 text-xs text-foreground md:justify-end">
                    <Link href={legalHref} className="hover:underline">{dict.footer.legalNotice}</Link>
                    <Link href={termsHref} className="hover:underline">{dict.footer.termsOfUse}</Link>
                    <Link href={privacyHref} className="hover:underline">{dict.footer.privacyPolicy}</Link>
                    <Link href={cookiesHref} className="hover:underline">{dict.footer.cookiePolicy}</Link>
                    <Link href={disclosureHref} className="hover:underline">{dict.footer.disclosure}</Link>
                </div>
            </div>
        </footer>
    );
}
