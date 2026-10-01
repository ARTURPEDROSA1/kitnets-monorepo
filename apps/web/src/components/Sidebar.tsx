"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { Moon, Sun, Home, Megaphone, Key, Calculator, Link as LinkIcon, HelpCircle, Rocket, HardHat, Briefcase, Building2, User, Users, UserCheck, KeyRound, Menu, TrendingUp, PiggyBank, Coins, LayoutDashboard, LineChart, ArrowLeftRight, FileText, AlertCircle, Plus, Minus, Gem, X, Zap, Building, ChevronsLeft, ChevronsRight, Landmark, Droplets, MapPinned, BookOpenCheck, BookText, NotebookPen, CalendarCheck, Eye, EyeOff, DollarSign, ArrowLeft, LogOut, LogIn, type LucideIcon } from "lucide-react";
import { PropertyFilters } from "./PropertyFilters";

import { useTheme } from "next-themes";
import Image from "next/image";
import { FLAGS } from "../lib/flags";
import { readCollapsedPreference, useCollapsedGroups, useSidebarCollapsed, writeCollapsedPreference } from "../lib/sidebar-preferences";
import { usePrivacy } from "../lib/privacy";

export { SIDEBAR_COLLAPSED_KEY } from "../lib/sidebar-preferences";

const languages = [
    { code: "pt", label: "Português" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
];

type SidebarView = 'main' | 'rent-filters' | 'buy-filters' | 'launches-filters' | 'calculators-menu' | 'indices-menu';

/** The views that fit the compact rail; the property filters need the full width. */
const RAIL_VIEWS: ReadonlySet<SidebarView> = new Set<SidebarView>(['main', 'calculators-menu', 'indices-menu']);

interface NavItem {
    label: string;
    /** path without the language prefix */
    path: string;
    icon: LucideIcon;
    /** colour of the icon (muted by default) */
    iconClassName?: string;
    /** "exact" for hubs whose sub-pages belong to other items (Dashboard); "prefix" otherwise */
    match?: 'exact' | 'prefix';
    /** other path prefixes that highlight this item */
    alsoActive?: string[];
    /** the sub-menu the item opens (Calculadoras, Indicadores) */
    view?: SidebarView;
}

type NavGroupKey = 'operacao' | 'contabil' | 'ferramentas' | 'configuracoes';

interface NavGroup {
    key: NavGroupKey;
    label: string;
    /** path prefixes (beyond the items') that count as "inside this group", e.g. the other Contábil pages */
    prefixes?: string[];
    items: NavItem[];
}

const ICON = "h-5 w-5 shrink-0 text-muted-foreground transition duration-75 group-hover:text-foreground";

/** The tools every visitor gets; while signed in they live in the Ferramentas group. */
const TOOL_ITEMS: NavItem[] = [
    ...(FLAGS.SHOW_CALCULATORS ? [{ label: "Calculadoras", path: '/calculadoras', icon: Calculator, view: 'calculators-menu' as SidebarView }] : []),
    { label: "Indicadores", path: '/indices/panorama', icon: LineChart, view: 'indices-menu', alsoActive: ['/indices'] },
];

const SIGNED_IN_GROUPS: NavGroup[] = [
    {
        key: 'operacao',
        label: "Operação",
        items: [
            { label: "Dashboard", path: '/dashboard', icon: LayoutDashboard, match: 'exact' },
            { label: "Imóveis", path: '/imoveis', icon: Home },
            { label: "Condomínio", path: '/condominio', icon: Building },
            { label: "Energia", path: '/dashboard/energy', icon: Zap, iconClassName: "text-amber-500 group-hover:text-amber-600" },
            { label: "Água", path: '/dashboard/water', icon: Droplets, iconClassName: "text-blue-500 group-hover:text-blue-600", alsoActive: ['/dashboard/billing'] },
            { label: "Imobiliária", path: '/imobiliaria', icon: Building2 },
            { label: "Corretores", path: '/corretores', icon: Users },
            { label: "Inquilinos", path: '/inquilinos', icon: UserCheck },
            { label: "Contratos", path: '/contratos', icon: FileText },
            { label: "Projetos", path: '/projetos', icon: HardHat },
        ],
    },
    {
        // Holding-level accounting fed by the bank account
        key: 'contabil',
        label: "Contábil & Fiscal",
        prefixes: ['/contabil'],
        items: [
            { label: "Políticas contábeis", path: '/contabil/politicas', icon: BookOpenCheck },
            { label: "Plano de contas", path: '/contabil/plano-de-contas', icon: BookText },
            { label: "Lançamentos", path: '/contabil/lancamentos', icon: NotebookPen },
            { label: "Extrato e conciliação", path: '/contabil/conciliacao', icon: ArrowLeftRight },
            { label: "Contas bancárias", path: '/contabil/contas-bancarias', icon: Landmark },
            { label: "Fechamento do mês", path: '/contabil/fechamento', icon: CalendarCheck },
        ],
    },
    {
        key: 'ferramentas',
        label: "Ferramentas",
        items: TOOL_ITEMS,
    },
    {
        key: 'configuracoes',
        label: "Configurações",
        items: [
            { label: "Proprietário", path: '/proprietario', icon: User },
        ],
    },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Sidebar({ lang, dict }: { lang: string; dict: any }) {
    const pathname = usePathname();
    const { setTheme, theme } = useTheme();
    const { isSignedIn, userId } = useAuth();
    const [sidebarView, setSidebarView] = React.useState<SidebarView>('main');
    const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);
    // Server renders expanded; the client snapshot takes over after hydration.
    const collapsed = useSidebarCollapsed();
    // the collapsed groups follow the signed-in user across devices (lib/sidebar-preferences.ts)
    const { collapsed: collapsedGroups, toggle: toggleGroup } = useCollapsedGroups(isSignedIn ? userId : null);
    const { hideSensitive, hideMoney, toggleSensitive, toggleMoney } = usePrivacy();

    // The compact rail applies to the main menu and to the calculators / indicators sub-menus
    // (every item there has an icon); the property filters need the full width, so they temporarily expand.
    const navCollapsed = collapsed && RAIL_VIEWS.has(sidebarView);

    // Mirror the effective state onto <html data-sidebar> so CSS can size the
    // rail and the page offset (globals.css). Read the store directly so the
    // hydration pass (which still sees the server value) cannot undo what the
    // inline script applied before first paint.
    React.useEffect(() => {
        const active = readCollapsedPreference() && RAIL_VIEWS.has(sidebarView);
        if (active) {
            document.documentElement.setAttribute('data-sidebar', 'collapsed');
        } else {
            document.documentElement.removeAttribute('data-sidebar');
        }
    }, [collapsed, sidebarView]);

    const toggleCollapsed = () => writeCollapsedPreference(!collapsed);

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

    const localized = (path: string) => (lang === 'pt' ? path : `/${lang}${path}`);
    const homeHref = lang === 'pt' ? '/' : `/${lang}`;
    const isActive = (path: string) => pathname === path;
    const startsWith = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

    const isItemActive = (item: NavItem) => {
        const href = localized(item.path);
        if (item.match === 'exact' ? isActive(href) : startsWith(href)) return true;
        return (item.alsoActive ?? []).some((prefix) => startsWith(localized(prefix)));
    };

    const isGroupActive = (group: NavGroup) =>
        group.items.some(isItemActive) || (group.prefixes ?? []).some((prefix) => startsWith(localized(prefix)));

    /** One menu entry: icon + label, label hidden and tooltip shown on the compact rail. */
    const renderItem = (item: NavItem) => {
        const href = localized(item.path);
        const active = isItemActive(item);
        const Icon = item.icon;
        return (
            <li key={item.path}>
                <Link
                    title={navCollapsed ? item.label : undefined}
                    href={href}
                    onClick={item.view ? () => setSidebarView(item.view as SidebarView) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`sidebar-item flex w-full items-center rounded-lg p-2 text-left text-foreground hover:bg-accent group min-h-[44px] ${active ? 'bg-accent' : ''}`}
                >
                    <Icon className={`${ICON} ${item.iconClassName ?? ''}`} />
                    <span className="ms-3 sidebar-label">{item.label}</span>
                </Link>
            </li>
        );
    };

    /** A collapsible group: a small uppercase heading with a +/- toggle, then its items. */
    const renderGroup = (group: NavGroup) => {
        const active = isGroupActive(group);
        const open = active || !collapsedGroups.has(group.key);
        const listId = `sidebar-group-${group.key}`;
        return (
            <li key={group.key} data-nav-group={group.key} data-nav-active={active ? "" : undefined} className="nav-group border-t border-border pt-2 first:border-t-0 first:pt-0">
                <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={open}
                    aria-controls={listId}
                    title={navCollapsed ? group.label : (open ? `Recolher ${group.label}` : `Expandir ${group.label}`)}
                    className="sidebar-item flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="sidebar-label">{group.label}</span>
                    {open ? <Minus className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
                <ul id={listId} className="nav-group-items space-y-1 pt-1">
                    {group.items.map(renderItem)}
                    {group.key === 'configuracoes' && toolsInGroup && (
                        <li className="space-y-2 px-2 pt-2">{toolRows}</li>
                    )}
                </ul>
            </li>
        );
    };

    const signedOutItems: NavItem[] = [
        ...(FLAGS.SHOW_MARKETPLACE ? [
            { label: dict.menu.advertise as string, path: '/anunciar', icon: Megaphone, match: 'exact' as const },
            { label: dict.menu.rent as string, path: '/alugar', icon: Key, match: 'exact' as const, view: 'rent-filters' as SidebarView },
            { label: dict.menu.buy as string, path: '/comprar', icon: Home, match: 'exact' as const, view: 'buy-filters' as SidebarView },
            { label: dict.menu.launches as string, path: '/lancamentos', icon: Rocket, match: 'exact' as const, view: 'launches-filters' as SidebarView },
        ] : []),
        ...TOOL_ITEMS.map((item) => (item.path === '/calculadoras' ? { ...item, label: dict.menu.calculators as string } : item)),
        ...(FLAGS.SHOW_USEFUL_LINKS ? [{ label: dict.menu.usefulLinks as string, path: '/links-uteis', icon: LinkIcon, match: 'exact' as const }] : []),
        ...(FLAGS.SHOW_FAQ ? [{ label: dict.menu.faq as string, path: '/perguntas-frequentes', icon: HelpCircle, match: 'exact' as const }] : []),
    ];

    const loginItems: NavItem[] = [
        // Public pages: the sign-in entry reads "Login" (the account is the owner's)
        { label: (dict.menu.login as string | undefined) ?? "Login", path: '/login/proprietario', icon: LogIn, match: 'exact' },
        ...(FLAGS.SHOW_LOGIN_LINKS ? [
            { label: dict.menu.brokers as string, path: '/login/corretor', icon: Briefcase, match: 'exact' as const },
            { label: dict.menu.agencies as string, path: '/login/imobiliaria', icon: Building2, match: 'exact' as const },
            { label: dict.menu.residents as string, path: '/login', icon: User, match: 'exact' as const },
            { label: dict.menu.owners as string, path: '/login/proprietario', icon: KeyRound, match: 'exact' as const },
            { label: dict.menu.developers as string, path: '/login/construtora', icon: HardHat, match: 'exact' as const },
        ] : []),
    ];

    /** The calculator sub-menu, by category; on the rail every calculator is listed as an icon. */
    const calculatorSections: { key: string; label: string; items: NavItem[] }[] = [
        {
            key: 'taxes', label: dict.menu.taxes, items: [
                { label: dict.menu.rentOnIndividual, path: '/calculadoras/imposto-aluguel-pessoa-fisica', icon: User },
                { label: dict.menu.rentalOnHolding, path: '/calculadoras/aluguel-na-holding', icon: Building2 },
                { label: dict.menu.irpf2026, path: '/calculadoras/irpf-2026', icon: Calculator },
                { label: dict.menu.highIncomeTax, path: '/calculadoras/imposto-minimo-altas-rendas', icon: Gem },
            ],
        },
        {
            key: 'finance', label: dict.menu.finance, items: [
                { label: "Conversor de Juros Mensal e Anual", path: '/calculadoras/conversor-juros-mensal-anual', icon: ArrowLeftRight },
                { label: "Juros Compostos", path: '/calculadora-juros-compostos', icon: TrendingUp },
                { label: "Payback de Imóvel", path: '/calculadora-payback-imovel', icon: PiggyBank },
                { label: dict.menu.financialIndependence, path: '/calculadora-independencia-financeira', icon: Sun },
            ],
        },
        {
            key: 'rent', label: dict.menu.rentCategory, items: [
                { label: "Reajuste de Aluguel", path: '/calculadora-reajuste-aluguel', icon: TrendingUp },
                { label: dict.rentLateFineCalculatorPage?.menuTitle || "Multa por Atraso", path: '/calculadoras/multa-atraso-aluguel', icon: AlertCircle },
                { label: dict.rentFineCalculatorPage?.menuTitle || "Calculadora Rescisão", path: '/calculadoras/multa-rescisao-contrato-aluguel', icon: FileText },
                { label: dict.proRataRentCalculatorPage?.menuTitle || "Aluguel Proporcional", path: '/calculadoras/aluguel-proporcional', icon: Calculator },
            ],
        },
        {
            key: 'investment', label: dict.menu.investment, items: [
                { label: "Renda do Aluguel paga o Imóvel?", path: '/calculadoras/renda-aluguel', icon: Coins },
                { label: "Simulador de Amortização", path: '/calculadora-amortizacao-financiamento-imobiliario', icon: PiggyBank },
            ],
        },
    ];

    const indexItems: NavItem[] = [
        { label: "Panorama Econômico", path: '/indices/panorama', icon: LayoutDashboard },
        ...['CDI', 'FipeZAP', 'IGPM', 'INPC', 'IPCA', 'IVAR', 'REAJUSTE-SALARIO-MINIMO', 'SELIC'].map((code) => ({
            label: code === 'IGPM' ? 'IGP-M' : code === 'REAJUSTE-SALARIO-MINIMO' ? 'Salário Mínimo' : code,
            path: `/indices/${code.toLowerCase()}`,
            icon: TrendingUp,
        })),
        { label: "FipeZAP por cidade", path: '/indices/fipezap/cidades', icon: MapPinned },
    ];

    /** A sub-menu entry (calculators / indicators): smaller text, icon + tooltip on the rail. */
    const renderSubItem = (item: NavItem) => {
        const Icon = item.icon;
        const href = localized(item.path);
        const active = isActive(href);
        return (
            <li key={item.path}>
                <Link
                    href={href}
                    title={navCollapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`sidebar-item flex items-center rounded-lg p-2 text-foreground hover:bg-accent group min-h-[44px] ${active ? 'bg-accent' : ''}`}
                >
                    <Icon className={ICON} />
                    <span className="ms-3 sidebar-label text-sm">{item.label}</span>
                </Link>
            </li>
        );
    };

    const backButton = (
        <button
            type="button"
            onClick={backToMain}
            title={navCollapsed ? dict.menu.back : undefined}
            className="sidebar-item mb-2 flex w-full items-center rounded-lg p-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground min-h-[44px]"
        >
            <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="ms-3 sidebar-label">{dict.menu.back}</span>
        </button>
    );

    const toolButton = "h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";
    const toolButtonOn = "h-9 w-9 rounded-lg border border-primary/40 bg-accent text-foreground hover:bg-accent/80 transition-colors";

    // Language, theme, the compact-rail toggle and, while signed in, the privacy toggles. In the
    // signed-in main menu they live inside the Configurações group; on the public pages and in the
    // calculators / indicators sub-menus (where the groups are not shown) they stay in the footer so
    // they remain reachable. Icons only; the tooltip says what each one does. Stack vertically on the rail.
    const toolsInGroup = Boolean(isSignedIn && FLAGS.SHOW_DASHBOARD_LINKS && sidebarView === 'main');
    const toolRows = (
        <>
            <div className="sidebar-footer-row flex items-center gap-2">
                <div className="sidebar-lang flex-1 min-w-0">
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
                        className={toolButton}
                        title={theme === 'dark' ? "Mudar para modo claro" : "Mudar para modo escuro"}
                        aria-label={theme === 'dark' ? "Mudar para modo claro" : "Mudar para modo escuro"}
                    >
                        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </Button>
                </div>
            </div>
            <div className="sidebar-tools flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={toggleCollapsed}
                    aria-pressed={collapsed}
                    title={collapsed ? dict.menu.showMore : dict.menu.showLess}
                    aria-label={collapsed ? dict.menu.showMore : dict.menu.showLess}
                    className={`hidden sm:inline-flex ${toolButton}`}
                >
                    {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
                </Button>
                {isSignedIn && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={toggleSensitive}
                            aria-pressed={hideSensitive}
                            title={hideSensitive ? "Mostrar dados sensíveis (endereços, CPF/CNPJ, medidores)" : "Ocultar dados sensíveis (endereços, CPF/CNPJ, medidores) em todas as páginas"}
                            aria-label={hideSensitive ? "Mostrar dados sensíveis" : "Ocultar dados sensíveis"}
                            className={hideSensitive ? toolButtonOn : toolButton}
                        >
                            {hideSensitive ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={toggleMoney}
                            aria-pressed={hideMoney}
                            title={hideMoney ? "Mostrar valores em R$" : "Ocultar valores em R$ em todas as páginas"}
                            aria-label={hideMoney ? "Mostrar valores em R$" : "Ocultar valores em R$"}
                            className={hideMoney ? toolButtonOn : toolButton}
                        >
                            <DollarSign className={`h-5 w-5 ${hideMoney ? 'opacity-40' : ''}`} />
                        </Button>
                    </>
                )}
            </div>
        </>
    );

    return (
        <>
            <div className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-4 sm:hidden">
                <Link href={homeHref} className="flex items-center gap-2">
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
                className={`fixed left-0 top-0 z-[60] sm:z-40 h-screen w-64 sm:w-[var(--sidebar-width)] transition-[transform,width] duration-200 border-r border-border bg-background sm:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
                aria-modal={isMobileOpen ? "true" : undefined}
                role={isMobileOpen ? "dialog" : undefined}
            >
                <div className="flex h-full flex-col justify-between px-3 py-4 overflow-y-auto custom-scrollbar">
                    {sidebarView === 'main' ? (
                        <div>
                            <div className="sidebar-header flex items-center justify-between mb-5 ps-2.5">
                                <Link href={homeHref} className="sidebar-brand flex items-baseline" title={navCollapsed ? "Kitnets.com" : undefined}>
                                    <Image
                                        src="/kitnets-logo.png"
                                        alt="Kitnets Logo"
                                        width={32}
                                        height={32}
                                        className="h-8 w-8 me-3"
                                        sizes="32px"
                                        priority
                                    />
                                    <span className="sidebar-label whitespace-nowrap text-xl font-semibold text-foreground leading-none">
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
                            {isSignedIn ? (
                                FLAGS.SHOW_DASHBOARD_LINKS && (
                                    <ul className="space-y-2 font-medium">
                                        {SIGNED_IN_GROUPS.map(renderGroup)}
                                    </ul>
                                )
                            ) : (
                                <ul className="space-y-2 font-medium">
                                    {signedOutItems.map(renderItem)}
                                    <li className="my-2 border-t border-border" />
                                    {loginItems.map(renderItem)}
                                </ul>
                            )}
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
                        <div className="space-y-2">
                            {backButton}

                            <h2 className="sidebar-rail-hidden px-2 pb-2 text-lg font-semibold text-foreground">{dict.menu.calculators}</h2>

                            <div className="space-y-4">
                                {calculatorSections.map((section, index) => (
                                    <div key={section.key} className="space-y-1">
                                        {navCollapsed && index > 0 && <div className="my-1 border-t border-border" aria-hidden="true" />}
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(section.key)}
                                            aria-expanded={!!expandedSections[section.key]}
                                            className="sidebar-rail-hidden flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground focus:outline-none"
                                        >
                                            {section.label}
                                            {expandedSections[section.key] ? (
                                                <Minus className="h-4 w-4" />
                                            ) : (
                                                <Plus className="h-4 w-4" />
                                            )}
                                        </button>
                                        {(navCollapsed || expandedSections[section.key]) && (
                                            <ul className="space-y-1 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                                                {section.items.map(renderSubItem)}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : sidebarView === 'indices-menu' ? (
                        <div className="space-y-2">
                            {backButton}

                            <h2 className="sidebar-rail-hidden px-2 pb-2 text-lg font-semibold text-foreground">Indicadores</h2>

                            <ul className="space-y-1 font-medium">
                                {indexItems.map(renderSubItem)}
                            </ul>
                        </div>
                    ) : null}


                    <div className="mt-auto space-y-2 pt-4 border-t border-border w-full px-2 pb-2">
                        {!toolsInGroup && toolRows}

                        {isSignedIn && FLAGS.SHOW_DASHBOARD_LINKS && (
                            <SignOutButton>
                                <button
                                    type="button"
                                    title={navCollapsed ? "Sair" : undefined}
                                    className="sidebar-item flex w-full items-center rounded-lg p-2 text-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 group min-h-[44px]"
                                >
                                    <LogOut className="h-5 w-5 shrink-0 text-muted-foreground transition duration-75 group-hover:text-red-600" aria-hidden="true" />
                                    <span className="ms-3 sidebar-label">Sair</span>
                                </button>
                            </SignOutButton>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
