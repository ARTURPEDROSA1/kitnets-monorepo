"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { Moon, Sun, Home, Megaphone, Key, Calculator, Link as LinkIcon, HelpCircle, Search, Bell, ChevronDown, Rocket, HardHat, Briefcase, Building2, User, KeyRound, Menu, TrendingUp, PiggyBank, Coins, LayoutDashboard, LineChart, ArrowLeftRight } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { getDictionary } from "../dictionaries";

import { FLAGS } from "../lib/flags";

const languages = [
    { code: "pt", label: "Português" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
];

export function Sidebar({ lang }: { lang: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const { setTheme, theme } = useTheme();
    const { isSignedIn } = useAuth();
    const [sidebarView, setSidebarView] = React.useState<'main' | 'rent-filters' | 'buy-filters' | 'launches-filters' | 'calculators-menu' | 'indices-menu'>('main');
    const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);

    const dict = getDictionary(lang);

    // Close mobile sidebar on route change
    React.useEffect(() => {
        setIsMobileOpen(false);
    }, [pathname]);

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

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
            // But wait, our middleware rewrites / to /pt internally, so valid langs might be stripped?
            // Actually, pathname from usePathname in Next.js app dir usually includes the lang param if it is dynamic.
            // EXCEPT when middleware rewrites it away? No, usePathname returns what the browser sees.
            // browser sees /. 
            path = `/${newLang}${pathname === '/' ? '' : pathname}`;
        }

        // Special handling: if newLang is pt, remove /pt prefix
        if (newLang === 'pt') {
            path = path.replace('/pt', '') || '/';
        }

        window.location.href = path;
    };

    const toggleRentFilters = () => {
        setSidebarView('rent-filters');
        const path = lang === 'pt' ? '/alugar' : `/${lang}/alugar`;
        router.push(path);
    };

    const toggleBuyFilters = () => {
        setSidebarView('buy-filters');
        const path = lang === 'pt' ? '/comprar' : `/${lang}/comprar`;
        router.push(path);
    };

    const toggleLaunchesFilters = () => {
        setSidebarView('launches-filters');
        const path = lang === 'pt' ? '/lancamentos' : `/${lang}/lancamentos`;
        router.push(path);
    };

    const toggleCalculatorsMenu = () => {
        setSidebarView('calculators-menu');
        const path = lang === 'pt' ? '/calculadoras/renda-aluguel' : `/${lang}/calculadoras/renda-aluguel`;
        router.push(path);
    };

    const toggleIndicesMenu = () => {
        setSidebarView('indices-menu');
        const path = lang === 'pt' ? '/indices/panorama' : `/${lang}/indices/panorama`;
        router.push(path);
    };

    const backToMain = () => {
        setSidebarView('main');
    };

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
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside className={`fixed left-0 top-0 z-50 h-screen w-64 transition-transform border-r border-border bg-background sm:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex h-full flex-col justify-between px-3 py-4 overflow-y-auto">
                    {sidebarView === 'main' ? (
                        <div>
                            <Link href={lang === 'pt' ? '/' : `/${lang}`} className="mb-5 flex items-baseline ps-2.5">
                                <Image
                                    src="/kitnets-logo.png"
                                    alt="Kitnets Logo"
                                    width={32}
                                    height={32}
                                    className="h-8 w-8 me-3"
                                />
                                <span className="whitespace-nowrap text-xl font-semibold text-foreground leading-none">
                                    Kitnets.com
                                </span>
                            </Link>
                            <ul className="space-y-2 font-medium">

                                {FLAGS.SHOW_MARKETPLACE && (
                                    <>
                                        <li>
                                            <Link
                                                href={lang === 'pt' ? '/anunciar' : `/${lang}/anunciar`}
                                                className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                            >
                                                <Megaphone className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.advertise}</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <button
                                                onClick={toggleRentFilters}
                                                className="w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group text-left"
                                            >
                                                <Key className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.rent}</span>
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                onClick={toggleBuyFilters}
                                                className="w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group text-left"
                                            >
                                                <Home className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.buy}</span>
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                onClick={toggleLaunchesFilters}
                                                className="w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group text-left"
                                            >
                                                <Rocket className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                <span className="ms-3">{dict.menu.launches}</span>
                                            </button>
                                        </li>
                                    </>
                                )}

                                {FLAGS.SHOW_CALCULATORS && (
                                    <li>
                                        <button
                                            onClick={toggleCalculatorsMenu}
                                            className="w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group text-left"
                                        >
                                            <Calculator className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                            <span className="ms-3">{dict.menu.calculators}</span>
                                        </button>
                                    </li>
                                )}

                                <li>
                                    <button
                                        onClick={toggleIndicesMenu}
                                        className="w-full flex items-center rounded-lg p-2 text-foreground hover:bg-accent group text-left"
                                    >
                                        <LineChart className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3">Indicadores</span>
                                    </button>
                                </li>

                                {FLAGS.SHOW_USEFUL_LINKS && (
                                    <li>
                                        <Link
                                            href={lang === 'pt' ? '/links-uteis' : `/${lang}/links-uteis`}
                                            className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
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
                                            className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                        >
                                            <HelpCircle className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                            <span className="ms-3">{dict.menu.faq}</span>
                                        </Link>
                                    </li>
                                )}

                                <li className="my-2 border-t border-border" />
                                {isSignedIn ? (
                                    FLAGS.SHOW_DASHBOARD_LINKS && (
                                        <>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/dashboard' : `/${lang}/dashboard`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <LayoutDashboard className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Dashboard</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/profile' : `/${lang}/profile`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <User className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">Meu Perfil</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <SignOutButton>
                                                    <button className="flex w-full items-center rounded-lg p-2 text-foreground hover:bg-red-50 hover:text-red-600 group">
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
                                    FLAGS.SHOW_LOGIN_LINKS && (
                                        <>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/login/corretor' : `/${lang}/login/corretor`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <Briefcase className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.brokers}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/login/imobiliaria' : `/${lang}/login/imobiliaria`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <Building2 className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.agencies}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/login' : `/${lang}/login`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <User className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.residents}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/login/proprietario' : `/${lang}/login/proprietario`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <KeyRound className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.owners}</span>
                                                </Link>
                                            </li>
                                            <li>
                                                <Link
                                                    href={lang === 'pt' ? '/login/construtora' : `/${lang}/login/construtora`}
                                                    className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                                >
                                                    <HardHat className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                                    <span className="ms-3">{dict.menu.developers}</span>
                                                </Link>
                                            </li>
                                        </>
                                    )
                                )}
                            </ul>
                        </div>
                    ) : sidebarView === 'rent-filters' || sidebarView === 'buy-filters' || sidebarView === 'launches-filters' ? (
                        <div className="space-y-4">
                            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                                <span className="mr-1">←</span> {dict.menu.back}
                            </button>

                            <h2 className="text-lg font-semibold text-foreground">{dict.filters.title}</h2>

                            <div className="space-y-6">
                                {/* Localização */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.location}</label>
                                    <div className="relative">
                                        <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Belo Horizonte (MG)"
                                            className="w-full rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="flex items-center gap-1 rounded bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                                            Belo Horizonte MG <span className="cursor-pointer font-bold ml-1">×</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.propertyType}</label>
                                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                                        <option value="">{dict.filters.selectPlaceholder}</option>
                                        <option value="kitnet">{dict.filters.kitnet}</option>
                                        <option value="studio">{dict.filters.studio}</option>
                                        <option value="luxuryStudio">{dict.filters.luxuryStudio}</option>
                                        <option value="flat">{dict.filters.flat}</option>
                                        <option value="apartment">{dict.filters.apartment}</option>
                                        {sidebarView !== 'launches-filters' && (
                                            <option value="barracao">{dict.filters.barracao}</option>
                                        )}
                                        <option value="house">{dict.filters.house}</option>
                                        <option value="penthouse">{dict.filters.penthouse}</option>
                                        <option value="duplex">{dict.filters.duplex}</option>
                                        <option value="pilotis">{dict.filters.pilotis}</option>
                                        <option value="townhouse">{dict.filters.townhouse}</option>
                                    </select>
                                </div>

                                {/* Valor */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.price}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={dict.filters.min}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <input
                                            type="text"
                                            placeholder={dict.filters.max}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                    </div>
                                </div>

                                {/* Área */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.area}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={dict.filters.min}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <input
                                            type="text"
                                            placeholder={dict.filters.max}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                    </div>
                                </div>

                                {/* Número de quartos */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.bedrooms}</label>
                                    <div className="flex gap-1">
                                        {['1+', '2+', '3+'].map((num) => (
                                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>



                                {/* Número de vagas */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.parking}</label>
                                    <div className="flex gap-1">
                                        {['1+', '2+', '3+'].map((num) => (
                                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Número de banheiros */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-foreground">{dict.filters.bathrooms}</label>
                                    <div className="flex gap-1">
                                        {['1+', '2+', '3+'].map((num) => (
                                            <button key={num} className="flex-1 rounded border border-input py-1 text-sm bg-muted/50 hover:bg-accent hover:text-accent-foreground font-medium text-muted-foreground">
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Anúncio possui */}
                                <div className="space-y-2">
                                    <button
                                        onClick={() => toggleSection("listingHas")}
                                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground"
                                    >
                                        {dict.filters.listingHas}
                                        <ChevronDown
                                            className={`h-4 w-4 transition-transform ${expandedSections.listingHas ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                    {expandedSections.listingHas && (
                                        <div className="space-y-2">
                                            {[dict.filters.virtualTour, dict.filters.video, dict.filters.floorPlan].map((item, idx) => (
                                                <div key={idx} className="flex items-center space-x-2">
                                                    <input type="checkbox" id={`listingHas-${idx}`} className="rounded border-gray-300" />
                                                    <label
                                                        htmlFor={`listingHas-${idx}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                    >
                                                        {item}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Filtrar por características */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleSection('features')}
                                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                                    >
                                        {dict.filters.features}
                                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['features'] ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSections['features'] && (
                                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                                            {dict.lists.features.map((item) => (
                                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                                    {item}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Comodidade */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleSection('amenities')}
                                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                                    >
                                        {dict.filters.amenities}
                                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['amenities'] ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSections['amenities'] && (
                                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                                            {dict.lists.amenities.map((item) => (
                                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                                    {item}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Opções de localização */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleSection('locationOpts')}
                                        className="flex w-full items-center justify-between text-xs font-semibold text-foreground hover:text-primary focus:outline-none"
                                    >
                                        {dict.filters.locationOptions}
                                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedSections['locationOpts'] ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSections['locationOpts'] && (
                                        <div className="space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                                            {dict.lists.locationOptions.map((item) => (
                                                <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                                    <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                                    {item}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            </div>

                            <div className="pt-6 flex flex-col gap-4">
                                <Link href={lang === 'pt' ? (sidebarView === 'buy-filters' ? '/comprar' : sidebarView === 'launches-filters' ? '/lancamentos' : '/alugar') : `/${lang}/${sidebarView === 'buy-filters' ? 'comprar' : sidebarView === 'launches-filters' ? 'lancamentos' : 'alugar'}`}>
                                    <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">{dict.filters.seeResults}</Button>
                                </Link>

                                <Button variant="outline" className="w-full border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                                    <Bell className="mr-2 h-4 w-4" />
                                    {dict.filters.createAlert}
                                </Button>
                            </div>
                        </div>
                    ) : sidebarView === 'calculators-menu' ? (
                        <div className="space-y-4">
                            <button onClick={backToMain} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                                <span className="mr-1">←</span> {dict.menu.back}
                            </button>

                            <h2 className="text-lg font-semibold text-foreground">{dict.menu.calculators}</h2>

                            <ul className="space-y-2 font-medium">
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadoras/renda-aluguel' : `/${lang}/calculadoras/renda-aluguel`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <Coins className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Renda do Aluguel paga o Imóvel?</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadora-reajuste-aluguel' : `/${lang}/calculadora-reajuste-aluguel`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Reajuste de Aluguel</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadora-amortizacao-financiamento-imobiliario' : `/${lang}/calculadora-amortizacao-financiamento-imobiliario`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <PiggyBank className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Simulador de Amortização</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadoras/conversor-juros-mensal-anual' : `/${lang}/calculadoras/conversor-juros-mensal-anual`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <ArrowLeftRight className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Conversor de Juros Mensal e Anual</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadora-juros-compostos' : `/${lang}/calculadora-juros-compostos`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Juros Compostos</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href={lang === 'pt' ? '/calculadora-independencia-financeira' : `/${lang}/calculadora-independencia-financeira`}
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <Sun className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">{dict.menu.financialIndependence}</span>
                                    </Link>
                                </li>
                            </ul>
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
                                        className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                    >
                                        <LayoutDashboard className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                        <span className="ms-3 text-sm">Panorama Econômico</span>
                                    </Link>
                                </li>
                                {['IPCA', 'IGPM', 'INPC', 'IVAR', 'FipeZAP', 'SELIC', 'CDI'].map((code) => (
                                    <li key={code}>
                                        <Link
                                            href={lang === 'pt' ? `/indices/${code.toLowerCase()}` : `/${lang}/indices/${code.toLowerCase()}`}
                                            className="flex items-center rounded-lg p-2 text-foreground hover:bg-accent group"
                                        >
                                            <TrendingUp className="h-5 w-5 text-muted-foreground transition duration-75 group-hover:text-foreground" />
                                            <span className="ms-3 text-sm">{code === 'IGPM' ? 'IGP-M' : code}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
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
