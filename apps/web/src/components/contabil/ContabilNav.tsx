"use client";

/** Tabs across the Contábil & Fiscal pages. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
    { href: "/contabil/politicas", label: "Políticas contábeis" },
    { href: "/contabil/plano-de-contas", label: "Plano de contas" },
    { href: "/contabil/lancamentos", label: "Lançamentos" },
    { href: "/contabil/contas-bancarias", label: "Contas bancárias" },
];

export function ContabilNav({ lang }: { lang: "en" | "pt" | "es" }) {
    const pathname = usePathname() ?? "";
    const base = lang === "pt" ? "" : `/${lang}`;
    return (
        <nav aria-label="Contábil & Fiscal" className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map(t => {
                const active = pathname.endsWith(t.href);
                return (
                    <Link
                        key={t.href}
                        href={`${base}${t.href}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                            active ? "border-emerald-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t.label}
                    </Link>
                );
            })}
        </nav>
    );
}
