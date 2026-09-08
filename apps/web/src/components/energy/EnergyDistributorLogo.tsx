"use client";

import React from "react";
import { Zap, ShieldCheck } from "lucide-react";

interface EnergyDistributorLogoProps {
    companyName?: string | null;
    className?: string;
    size?: "sm" | "md" | "lg";
    showName?: boolean;
}

export function EnergyDistributorLogo({
    companyName,
    className = "",
    size = "md",
    showName = false,
}: EnergyDistributorLogoProps) {
    const cleanName = (companyName || "CEMIG").trim().toUpperCase();

    // Size dimensions helper
    const dimensions = {
        sm: { height: 26, iconSize: "w-6 h-6", text: "text-xs font-bold" },
        md: { height: 38, iconSize: "w-8 h-8", text: "text-sm font-extrabold" },
        lg: { height: 50, iconSize: "w-11 h-11", text: "text-base font-extrabold" },
    }[size];

    // ── 1. CEMIG (Minas Gerais) ────────────────────────────────────────────────
    if (cleanName.includes("CEMIG")) {
        return (
            <div className={`inline-flex items-center gap-2.5 select-none ${className}`} title="CEMIG Distribuição S.A.">
                {/* Official CEMIG Logo: Geometric Diamond/Cube with distinctive Red & Green Accent */}
                <svg
                    height={dimensions.height}
                    viewBox="0 0 160 52"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    {/* Iconic CEMIG Symbol: Stylized bold red chevron & green accent */}
                    <path
                        d="M6 26L24 8L34 18L24 28L34 38L24 48L6 26Z"
                        fill="#D71920"
                    />
                    <path
                        d="M26 26L36 16L42 22L32 32L26 26Z"
                        fill="#009639"
                    />
                    {/* CEMIG Wordmark */}
                    <text
                        x="48"
                        y="34"
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontSize="28"
                        fontWeight="900"
                        letterSpacing="-0.5px"
                        fill="#D71920"
                    >
                        cemig
                    </text>
                    {/* Subtle dot above letter i */}
                    <circle cx="120" cy="16" r="3.5" fill="#009639" />
                </svg>
                {showName && (
                    <span className={`text-[#D71920] dark:text-[#f87171] ${dimensions.text}`}>
                        CEMIG
                    </span>
                )}
            </div>
        );
    }

    // ── 2. CPFL ENERGIA ────────────────────────────────────────────────────────
    if (cleanName.includes("CPFL")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="CPFL Energia">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 150 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <rect width="40" height="40" rx="8" y="4" fill="#F37021" />
                    <path d="M12 24C12 17.37 17.37 12 24 12V18C20.68 18 18 20.68 18 24C18 27.32 20.68 30 24 30V36C17.37 36 12 30.63 12 24Z" fill="white" />
                    <text
                        x="48"
                        y="32"
                        fontFamily="system-ui, sans-serif"
                        fontSize="24"
                        fontWeight="900"
                        fill="#002B49"
                        className="dark:fill-slate-100"
                    >
                        CPFL
                    </text>
                </svg>
                {showName && <span className={`text-[#F37021] ${dimensions.text}`}>CPFL Energia</span>}
            </div>
        );
    }

    // ── 3. ENEL ────────────────────────────────────────────────────────────────
    if (cleanName.includes("ENEL")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Enel Brasil">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 140 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <defs>
                        <linearGradient id="enelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00A3E0" />
                            <stop offset="50%" stopColor="#E40046" />
                            <stop offset="100%" stopColor="#78BE20" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M8 32V16C8 11.58 11.58 8 16 8H28C32.42 8 36 11.58 36 16V22H16V32H36V38H16C11.58 38 8 34.42 8 32Z"
                        fill="url(#enelGrad)"
                    />
                    <text
                        x="44"
                        y="33"
                        fontFamily="system-ui, sans-serif"
                        fontSize="26"
                        fontWeight="800"
                        fill="#002F6C"
                        className="dark:fill-slate-100"
                    >
                        enel
                    </text>
                </svg>
                {showName && <span className={`text-[#00A3E0] ${dimensions.text}`}>Enel</span>}
            </div>
        );
    }

    // ── 4. LIGHT (Rio de Janeiro) ──────────────────────────────────────────────
    if (cleanName.includes("LIGHT")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Light S.A.">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 140 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <circle cx="22" cy="24" r="16" fill="#0072CE" />
                    <path d="M22 13L16 26H22L20 35L28 22H22L22 13Z" fill="#FFD100" />
                    <text
                        x="46"
                        y="32"
                        fontFamily="system-ui, sans-serif"
                        fontSize="25"
                        fontWeight="900"
                        fill="#0072CE"
                        className="dark:fill-sky-400"
                    >
                        Light
                    </text>
                </svg>
            </div>
        );
    }

    // ── 5. COPEL (Paraná) ──────────────────────────────────────────────────────
    if (cleanName.includes("COPEL")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Copel">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 140 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <rect width="36" height="36" rx="8" x="2" y="6" fill="#0055A5" />
                    <circle cx="20" cy="24" r="7" fill="#84BD00" />
                    <text
                        x="46"
                        y="32"
                        fontFamily="system-ui, sans-serif"
                        fontSize="24"
                        fontWeight="900"
                        fill="#0055A5"
                        className="dark:fill-sky-400"
                    >
                        COPEL
                    </text>
                </svg>
            </div>
        );
    }

    // ── 6. EQUATORIAL ENERGIA ──────────────────────────────────────────────────
    if (cleanName.includes("EQUATORIAL")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Equatorial Energia">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 170 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <circle cx="20" cy="24" r="16" fill="#FF671F" />
                    <circle cx="20" cy="24" r="9" fill="white" />
                    <circle cx="20" cy="24" r="4" fill="#002855" />
                    <text
                        x="44"
                        y="31"
                        fontFamily="system-ui, sans-serif"
                        fontSize="20"
                        fontWeight="900"
                        fill="#002855"
                        className="dark:fill-slate-100"
                    >
                        equatorial
                    </text>
                </svg>
            </div>
        );
    }

    // ── 7. ENERGISA ────────────────────────────────────────────────────────────
    if (cleanName.includes("ENERGISA")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Grupo Energisa">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 160 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <rect width="36" height="36" rx="8" x="2" y="6" fill="#002B49" />
                    <path d="M12 24L22 14V34L12 24Z" fill="#FF671F" />
                    <text
                        x="46"
                        y="32"
                        fontFamily="system-ui, sans-serif"
                        fontSize="22"
                        fontWeight="900"
                        fill="#002B49"
                        className="dark:fill-slate-100"
                    >
                        energisa
                    </text>
                </svg>
            </div>
        );
    }

    // ── 8. NEOENERGIA (Coelba, Celpe, Elektro, Cosern) ─────────────────────────
    if (cleanName.includes("NEOENERGIA") || cleanName.includes("COELBA") || cleanName.includes("CELPE") || cleanName.includes("ELEKTRO")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Neoenergia">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 170 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <circle cx="20" cy="24" r="16" fill="#00843D" />
                    <path d="M14 28C14 20 26 14 26 14C26 22 20 28 14 28Z" fill="#78BE20" />
                    <path d="M20 30C23 26 26 22 26 18C27 24 23 30 20 30Z" fill="#0072CE" />
                    <text
                        x="44"
                        y="31"
                        fontFamily="system-ui, sans-serif"
                        fontSize="20"
                        fontWeight="900"
                        fill="#00843D"
                        className="dark:fill-emerald-400"
                    >
                        neoenergia
                    </text>
                </svg>
            </div>
        );
    }

    // ── 9. CELESC ──────────────────────────────────────────────────────────────
    if (cleanName.includes("CELESC")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="Celesc Distribuição">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 140 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <rect width="36" height="36" rx="8" x="2" y="6" fill="#004F9F" />
                    <path d="M12 24L26 14V34L12 24Z" fill="#009639" />
                    <text
                        x="46"
                        y="32"
                        fontFamily="system-ui, sans-serif"
                        fontSize="23"
                        fontWeight="900"
                        fill="#004F9F"
                        className="dark:fill-sky-400"
                    >
                        Celesc
                    </text>
                </svg>
            </div>
        );
    }

    // ── 10. EDP ────────────────────────────────────────────────────────────────
    if (cleanName.includes("EDP")) {
        return (
            <div className={`inline-flex items-center gap-2 select-none ${className}`} title="EDP Brasil">
                <svg
                    height={dimensions.height}
                    viewBox="0 0 130 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    <circle cx="20" cy="24" r="16" fill="#EE161F" />
                    <text
                        x="44"
                        y="33"
                        fontFamily="system-ui, sans-serif"
                        fontSize="26"
                        fontWeight="900"
                        fill="#EE161F"
                    >
                        edp
                    </text>
                </svg>
            </div>
        );
    }

    // ── Fallback: Generic Branded Utility Badge ────────────────────────────────
    return (
        <div className={`inline-flex items-center gap-2 select-none px-2.5 py-1 rounded-xl bg-muted/60 border border-border ${className}`}>
            <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                <Zap className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-xs uppercase tracking-wider text-foreground">
                {companyName || "Distribuidora de Energia"}
            </span>
        </div>
    );
}
