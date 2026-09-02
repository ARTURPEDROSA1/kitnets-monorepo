"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { Moon, Sun, Home, Megaphone, Key, Calculator, Link as LinkIcon, HelpCircle, Rocket, HardHat, Briefcase, Building2, User, Users, UserCheck, KeyRound, Menu, TrendingUp, PiggyBank, Coins, LayoutDashboard, LineChart, ArrowLeftRight, FileText, AlertCircle, Plus, Minus, Gem, X } from "lucide-react";
import { PropertyFilters } from "./PropertyFilters";

import { useTheme } from "next-themes";
import Image from "next/image";
import { FLAGS } from "../lib/flags";

const languages = [
    { code: "pt", label: "Português" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Sidebar({ lang, dict }: { lang: string; dict: any }) {
    const pathname = usePathname();
    const { setTheme, theme } = useTheme();
    const { isSignedIn } = useAuth();
    const [sidebarView, setSidebarView] = React.useState<'main' | 'rent-filters' | 'buy-filters' | 'launches-filters' | 'calculators-menu' | 'indices-menu' | 'contents-menu'>('main');
    const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);

    // Dictionary is now passed as prop

    // Detect active section and update sidebar view
    React.useEffect(() => {
        setIsMobileOpen(false); // Close mobile sidebar on route change

        if (pathname.includes('calculadora')) {
            setSidebarView('calculators-menu');
        } else if (pathname.includes('/indices/')) {
            setSidebarView('indices-menu');
        } else if (pathname.includes('/alugar')) {
            setSidebarView('rent-filters');
        } else if (pathname.includes('/comprar')) {
            setSidebarView('buy-filters');
        } else if (pathname.includes('/lancamentos')) {
            setSidebarView('launches-filters');
        } else if (pathname.includes('/conteudos') || pathname.includes('/contents')) {
            setSidebarView('contents-menu');
        } else {
            setSidebarView('main');
        }
    }, [pathname]);

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const router = useRouter();

    const handleLanguageChange = (newLang: string) => {
        // Replace current lang in path with new lang
        const segments = pathname.split("/");
        // segments[0] is empty, segments[1] is lang (or empty if root)

        let path = pathname;
        if (segments[1] === "pt" || segments[1] === "en" || segments[1] === "es") {
            // If we are at /en/something, segments is ['', 'en', 'something']
            segments[1] = newLang;
            path = segments.join("/");
        } else {
            // We are at root /, or /some-page
            // If switching to a non-default lang, prepend it.
            path = `/${newLang}${pathname === '/' ? '' : pathname}`;
        }

        // Special handling: if newLang is pt, remove /pt prefix
        if (newLang === 'pt') {
            path = path.replace('/pt', '') || '/';
        }

        router.push(path);
    };

    const backToMain = () => {
        setSidebarView('main');
    };

    const isActive = (path: string) => pathname === path;

    return (
        <>
            <div className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-4 sm:hidden">
                <Link href={lang === 'pt' ? '/' : `/${lang}`} className="flex items-center gap-2">
                    <div className="relative h-8 w-8">
                        <Image
                            src="/icon.png"
                            alt="Kitnets Logo"
                            fill
                            className="object-contain"
                            sizes="32px"
                        />
                    </div>
                    <span className="text-lg font-bold text-foreground">
                        Kitnets<span className="text-muted-foreground text-xs">.com</span>
                    </span>
                </Link>
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="rounded-md p-2 text-foreground hover:bg-accent"
                    aria-label="Abrir menu"
                >
                    <Menu className="h-6 w-6" />
                </button>
            </div>

            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm sm:hidden"
                    onClick={() => setIsMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`fixed left-0 top-0 z-[60] h-screen w-64 transition-transform border-r border-border bg-background sm:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
                aria-modal={isMobileOpen ? "true" : undefined}
                role={isMobileOpen ? "dialog" : undefined}
            >
                <div className="flex h-full flex-col justify-between px-3 py-4 overflow-y-auto custom-scrollbar">
                    {sidebarView === 'main' ? (
                        <div>
                            <div className="flex items-center justify-between mb-5 ps-2.5">
                                <Link href={lang === 'pt' ? '/' : `/${lang}`} className="flex items-baseline">
                                    <Image
                                        src="/kitnets-logo.png"
                                        alt="Kitnets Logo"
                                        width={32}
                                        height={32}
                                        className="h-8 w-8 me-3"
                                        sizes="32px"
                                        priority
                                    />
                                    <span className="whitespace-nowrap text-xl font-semibold text-foreground leading-none">
                                        Kitnets.com
                                    </span>
                                </Link>
                                <button
                                    onClick={() => setIsMobileOpen(false)}
                                    className="sm:hidden p-1 text-muted-foreground hover:text-foreground"
                                    aria-label="Fechar menu"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <ul className="space-y-2 font-medium">

                                {!isSignedIn && (
                                    <>
                                        {FLAGS.SHOW_MARKETPLACE && (
                                            <>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/anunciar' : `/${lang}/anunciar`}
                                                        aria-current={isActive(lang === 'pt' ? '/anunciar' : `/${lang}/anunciar`) ? "page" : undefined}
                                                        className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/anunciar' : `/${lang}/anunciar`) ? 'bg-accent' : ''}`}
                                                    >
                                                        <Megaphone className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.advertise}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/alugar' : `/${lang}/alugar`}
                                                        onClick={() => setSidebarView('rent-filters')}
                                                        aria-current={isActive(lang === 'pt' ? '/alugar' : `/${lang}/alugar`) ? "page" : undefined}
                                                        className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/alugar' : `/${lang}/alugar`) ? 'bg-accent' : ''}`}
                                                    >
                                                        <Key className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.rent}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/comprar' : `/${lang}/comprar`}
                                                        onClick={() => setSidebarView('buy-filters')}
                                                        aria-current={isActive(lang === 'pt' ? '/comprar' : `/${lang}/comprar`) ? "page" : undefined}
                                                        className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/comprar' : `/${lang}/comprar`) ? 'bg-accent' : ''}`}
                                                    >
                                                        <Home className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.buy}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/lancamentos' : `/${lang}/lancamentos`}
                                                        onClick={() => setSidebarView('launches-filters')}
                                                        aria-current={isActive(lang === 'pt' ? '/lancamentos' : `/${lang}/lancamentos`) ? "page" : undefined}
                                                        className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/lancamentos' : `/${lang}/lancamentos`) ? 'bg-accent' : ''}`}
                                                    >
                                                        <Rocket className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.launches}</span>
                                                    </Link>
                                                </li>
                                            </>
                                        )}

                                        {FLAGS.SHOW_CALCULATORS && (
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras' : `/${lang}/calculadoras`}
                                                    onClick={() => setSidebarView('calculators-menu')}
                                                    aria-current={isActive(lang === 'pt' ? '/calculadoras' : `/${lang}/calculadoras`) ? "page" : undefined}
                                                    className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/calculadoras' : `/${lang}/calculadoras`) ? 'bg-accent' : ''}`}
                                                >
                                                    <Calculator className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.calculators}</span>
                                                </Link>
                                            </li>
                                        )}

                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/indices/panorama' : `/${lang}/indices/panorama`}
                                                onClick={() => setSidebarView('indices-menu')}
                                                aria-current={isActive(lang === 'pt' ? '/indices/panorama' : `/${lang}/indices/panorama`) ? "page" : undefined}
                                                className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/indices/panorama' : `/${lang}/indices/panorama`) ? 'bg-accent' : ''}`}
                                            >
                                                <LineChart className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">Indicadores</span>
                                            </Link>
                                        </li>

                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/conteudos' : `/${lang}/conteudos`}
                                                onClick={() => setSidebarView('contents-menu')}
                                                aria-current={isActive(lang === 'pt' ? '/conteudos' : `/${lang}/conteudos`) ? "page" : undefined}
                                                className={`w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] text-left ${isActive(lang === 'pt' ? '/conteudos' : `/${lang}/conteudos`) ? 'bg-accent' : ''}`}
                                            >
                                                <FileText className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.contents}</span>
                                            </Link>
                                        </li>

                                        {FLAGS.SHOW_USEFUL_LINKS && (
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/links-uteis' : `/${lang}/links-uteis`}
                                                    aria-current={isActive(lang === 'pt' ? '/links-uteis' : `/${lang}/links-uteis`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/links-uteis' : `/${lang}/links-uteis`) ? 'bg-accent' : ''}`}
                                                >
                                                    <LinkIcon className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.usefulLinks}</span>
                                                </Link>
                                            </li>
                                        )}

                                        {FLAGS.SHOW_FAQ && (
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/perguntas-frequentes' : `/${lang}/perguntas-frequentes`}
                                                    aria-current={isActive(lang === 'pt' ? '/perguntas-frequentes' : `/${lang}/perguntas-frequentes`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/perguntas-frequentes' : `/${lang}/perguntas-frequentes`) ? 'bg-accent' : ''}`}
                                                >
                                                    <HelpCircle className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.faq}</span>
                                                </Link>
                                            </li>
                                        )}

                                        <li className="my-2 border-t border-border" />
                                    </>
                                )}
                                {isSignedIn ? (
                                    FLAGS.SHOW_DASHBOARD_LINKS && (
                                        <>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/dashboard' : `/${lang}/dashboard`}
                                                    aria-current={isActive(lang === 'pt' ? '/dashboard' : `/${lang}/dashboard`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/dashboard' : `/${lang}/dashboard`) ? 'bg-accent' : ''}`}
                                                >
                                                    <LayoutDashboard className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Dashboard</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/imobiliaria' : `/${lang}/imobiliaria`}
                                                    aria-current={isActive(lang === 'pt' ? '/imobiliaria' : `/${lang}/imobiliaria`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/imobiliaria' : `/${lang}/imobiliaria`) ? 'bg-accent' : ''}`}
                                                >
                                                    <Building2 className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Imobiliária</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/corretores' : `/${lang}/corretores`}
                                                    aria-current={isActive(lang === 'pt' ? '/corretores' : `/${lang}/corretores`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/corretores' : `/${lang}/corretores`) ? 'bg-accent' : ''}`}
                                                >
                                                    <Users className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Corretores</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/inquilinos' : `/${lang}/inquilinos`}
                                                    aria-current={isActive(lang === 'pt' ? '/inquilinos' : `/${lang}/inquilinos`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/inquilinos' : `/${lang}/inquilinos`) ? 'bg-accent' : ''}`}
                                                >
                                                    <UserCheck className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Inquilinos</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/profile' : `/${lang}/profile`}
                                                    aria-current={isActive(lang === 'pt' ? '/profile' : `/${lang}/profile`) ? "page" : undefined}
                                                    className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/profile' : `/${lang}/profile`) ? 'bg-accent' : ''}`}
                                                >
                                                    <User className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Meu Perfil</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <SignOutButton>
                                                    <button className="flex w-full items-center rounded-lg p-2 text-foreground hover:bg-red-50 hover:text-red-600 group min-h-[44px]">
                                                        <svg
                                                            className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-red-600"
                                                            aria-hidden="true"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 18 16"
                                                        >
                                                            <path
                                                                stroke="currentColor"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth="2"
                                                                d="M1 8h11m0 0L8 4m4 4-4 4m4-11h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"
                                                            />
                                                        </svg>
                                                        <span className="ms-3">Sair</span>
                                                    </button>
                                                </SignOutButton>
                                            </li>
                                        </>
                                    )
                                ) : (
                                    <>
                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/login/proprietario' : `/${lang}/login/proprietario`}
                                                aria-current={isActive(lang === 'pt' ? '/login/proprietario' : `/${lang}/login/proprietario`) ? "page" : undefined}
                                                className={`flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${isActive(lang === 'pt' ? '/login/proprietario' : `/${lang}/login/proprietario`) ? 'bg-accent' : ''}`}
                                            >
                                                <KeyRound className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.owner}</span>
                                            </Link>
                                        </li>
                                        {FLAGS.SHOW_LOGIN_LINKS && (
                                            <>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/login/corretor' : `/${lang}/login/corretor`}
                                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                    >
                                                        <Briefcase className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.brokers}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/login/imobiliaria' : `/${lang}/login/imobiliaria`}
                                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                    >
                                                        <Building2 className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.agencies}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/login' : `/${lang}/login`}
                                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                    >
                                                        <User className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.residents}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/login/proprietario' : `/${lang}/login/proprietario`}
                                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                    >
                                                        <KeyRound className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.owners}</span>
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href={lang === 'pt' ? '/login/construtora' : `/${lang}/login/construtora`}
                                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                    >
                                                        <HardHat className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                        <span className="ms-3">{dict.menu.developers}</span>
                                                    </Link>
                                                </li>
                                            </>
                                        )
                                        }
                                    </>
                                )
                                }
                            </ul>
                        </div>
                    ) : sidebarView === 'rent-filters' || sidebarView === 'buy-filters' || sidebarView === 'launches-filters' ? (
                        <PropertyFilters
                            dict={dict}
                            sidebarView={sidebarView}
                            lang={lang}
                            backToMain={backToMain}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                        />
                    ) : sidebarView === 'calculators-menu' ? (
                        <div className="space-y-4">
                            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                                <span className="mr-1">←</span> {dict.menu.back}
                            </button>

                            <h2 className="text-lg font-semibold text-foreground">{dict.menu.calculators}</h2>

                            <div className="space-y-6">
                                {/* Impostos */}
                                <div className="space-y-1">
                                    <button
                                        onClick={() => toggleSection('taxes')}
                                        className="flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground focus:outline-none"
                                    >
                                        {dict.menu.taxes}
                                        {expandedSections['taxes'] ? (
                                            <Minus className="h-4 w-4" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                    </button>
                                    {expandedSections['taxes'] && (
                                        <ul className="space-y-1 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/imposto-aluguel-pessoa-fisica' : `/${lang}/calculadoras/imposto-aluguel-pessoa-fisica`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <User className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.menu.rentOnIndividual}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/aluguel-na-holding' : `/${lang}/calculadoras/aluguel-na-holding`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Building2 className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.menu.rentalOnHolding}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/irpf-2026' : `/${lang}/calculadoras/irpf-2026`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Calculator className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.menu.irpf2026}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/imposto-minimo-altas-rendas' : `/${lang}/calculadoras/imposto-minimo-altas-rendas`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Gem className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.menu.highIncomeTax}</span>
                                                </Link>
                                            </li>

                                        </ul>
                                    )}
                                </div>

                                {/* Financeiro */}
                                <div className="space-y-1">
                                    <button
                                        onClick={() => toggleSection('finance')}
                                        className="flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground focus:outline-none"
                                    >
                                        {dict.menu.finance}
                                        {expandedSections['finance'] ? (
                                            <Minus className="h-4 w-4" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                    </button>
                                    {expandedSections['finance'] && (
                                        <ul className="space-y-1 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/conversor-juros-mensal-anual' : `/${lang}/calculadoras/conversor-juros-mensal-anual`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <ArrowLeftRight className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">Conversor de Juros Mensal e Anual</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadora-juros-compostos' : `/${lang}/calculadora-juros-compostos`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">Juros Compostos</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadora-independencia-financeira' : `/${lang}/calculadora-independencia-financeira`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Sun className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.menu.financialIndependence}</span>
                                                </Link>
                                            </li>
                                        </ul>
                                    )}
                                </div>

                                {/* Aluguel */}
                                <div className="space-y-1">
                                    <button
                                        onClick={() => toggleSection('rent')}
                                        className="flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground focus:outline-none"
                                    >
                                        {dict.menu.rentCategory}
                                        {expandedSections['rent'] ? (
                                            <Minus className="h-4 w-4" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                    </button>
                                    {expandedSections['rent'] && (
                                        <ul className="space-y-1 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadora-reajuste-aluguel' : `/${lang}/calculadora-reajuste-aluguel`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">Reajuste de Aluguel</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/multa-atraso-aluguel' : `/${lang}/calculadoras/multa-atraso-aluguel`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <AlertCircle className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.rentLateFineCalculatorPage?.menuTitle || "Multa por Atraso"}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/multa-rescisao-contrato-aluguel' : `/${lang}/calculadoras/multa-rescisao-contrato-aluguel`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <FileText className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.rentFineCalculatorPage?.menuTitle || "Calculadora Rescisão"}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/aluguel-proporcional' : `/${lang}/calculadoras/aluguel-proporcional`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Calculator className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">{dict.proRataRentCalculatorPage?.menuTitle || "Aluguel Proporcional"}</span>
                                                </Link>
                                            </li>
                                        </ul>
                                    )}
                                </div>

                                {/* Investimento */}
                                <div className="space-y-1">
                                    <button
                                        onClick={() => toggleSection('investment')}
                                        className="flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground focus:outline-none"
                                    >
                                        {dict.menu.investment}
                                        {expandedSections['investment'] ? (
                                            <Minus className="h-4 w-4" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                    </button>
                                    {expandedSections['investment'] && (
                                        <ul className="space-y-1 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadoras/renda-aluguel' : `/${lang}/calculadoras/renda-aluguel`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <Coins className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">Renda do Aluguel paga o Imóvel?</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/calculadora-amortizacao-financiamento-imobiliario' : `/${lang}/calculadora-amortizacao-financiamento-imobiliario`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                                >
                                                    <PiggyBank className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3 text-sm">Simulador de Amortização</span>
                                                </Link>
                                            </li>
                                        </ul>
                                    )}
                                </div>


                            </div>
                        </div>
                    ) : sidebarView === 'indices-menu' ? (
                        <div className="space-y-4">
                            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                                <span className="mr-1">←</span> {dict.menu.back}
                            </button>

                            <h2 className="text-lg font-semibold text-foreground">Indicadores</h2>

                            <ul className="space-y-2 font-medium">
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/indices/panorama' : `/${lang}/indices/panorama`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                    >
                                        <LayoutDashboard className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Panorama Econômico</span>
                                    </Link>
                                </li>
                                {['CDI', 'FipeZAP', 'IGPM', 'INPC', 'IPCA', 'IVAR', 'REAJUSTE-SALARIO-MINIMO', 'SELIC'].map((code) => (
                                    <li key={code}>
                                        <Link
                                            href={lang === 'pt' ? `/indices/${code.toLowerCase()}` : `/${lang}/indices/${code.toLowerCase()}`}
                                            className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                        >
                                            <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                            <span className="ms-3 text-sm">{code === 'IGPM' ? 'IGP-M' : code === 'REAJUSTE-SALARIO-MINIMO' ? 'Salário Mínimo' : code}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : sidebarView === 'contents-menu' ? (
                        <div className="space-y-4">
                            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                                <span className="mr-1">←</span> {dict.menu.back}
                            </button>

                            <h2 className="text-lg font-semibold text-foreground">{dict.menu.contents}</h2>

                            <div className="space-y-6">
                                <div className="space-y-1">
                                    <ul className="space-y-1 font-medium">
                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/conteudos/impostos-e-legislacao' : `/${lang}/conteudos/impostos-e-legislacao`}
                                                className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                            >
                                                <FileText className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3 text-sm">{dict.menu.taxesAndLegislation}</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/conteudos/salario-e-renda' : `/${lang}/conteudos/salario-e-renda`}
                                                className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px]"
                                            >
                                                <FileText className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3 text-sm">{dict.menu.salariesAndIncome}</span>
                                            </Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : null}


                    <div className="mt-auto space-y-4 pt-4 border-t border-border w-full px-2 pb-2">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <select
                                    value={lang}
                                    onChange={(e) => handleLanguageChange(e.target.value)}
                                    aria-label="Selecionar idioma"
                                    className="w-full bg-background border border-border text-foreground text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                                >
                                    {languages.map((l) => (
                                        <option key={l.code} value={l.code}>{l.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center shrink-0">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                    className="h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    title={theme === 'dark' ? "Mudar para modo claro" : "Mudar para modo escuro"}
                                    aria-label={theme === 'dark' ? "Mudar para modo claro" : "Mudar para modo escuro"}
                                >
                                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
