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
            <div className={`inline-flex items-center select-none ${className}`} title="CEMIG Distribuição S.A.">
                {/* Official CEMIG Brand Logo: Authentic SVG with green CEMIG wordmark and yellow accent inside 'E' */}
                <svg
                    height={dimensions.height}
                    viewBox="0 0 121 31"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                >
                    {/* Distinctive Yellow/Orange pill inside the letter 'E' */}
                    <path
                        d="M 40.93399,11.52912 C 42.83774,11.52912 44.42524,13.11662 44.42524,15.12537 C 44.42524,17.13662 42.83774,18.72287 40.82774,18.72287 L 36.06775,18.72287 C 34.05899,18.72287 32.4715,17.13662 32.4715,15.12537 C 32.4715,13.11662 34.05899,11.52912 36.06775,11.52912 L 40.93399,11.52912 z"
                        fill="#FE9007"
                    />
                    {/* Official CEMIG Green Lettering (C, E, M, I, G) */}
                    <path
                        d="M 88.74325,26.655 C 88.74325,28.66625 87.15699,30.25125 85.147,30.25125 C 83.24325,30.25125 81.55075,28.66625 81.55075,26.655 L 81.55075,3.5975 C 81.55075,1.5875 83.24325,0 85.147,0 C 87.15699,0 88.74325,1.5875 88.74325,3.49125 L 88.74325,26.655 z M 112.85975,2.01075 C 113.91725,2.53825 114.65725,3.702 114.65725,5.07825 C 114.65725,7.087 113.071,8.6745 111.16725,8.6745 C 110.42725,8.6745 109.79225,8.462 109.2635,8.14575 C 108.09975,7.5095 106.72475,7.087 105.34975,7.087 C 100.90725,7.087 97.311,10.6845 97.311,15.12575 C 97.311,19.567 100.90725,23.16575 105.34975,23.16575 C 108.5235,23.16575 111.16725,21.262 112.54225,18.72325 L 105.34975,18.72325 C 103.33975,18.72325 101.7535,17.0295 101.7535,15.12575 C 101.7535,13.11575 103.33975,11.52825 105.34975,11.52825 L 116.87975,11.52825 C 118.88975,11.52825 120.47475,13.11575 120.47475,15.12575 C 120.47475,23.482 113.70475,30.25075 105.34975,30.25075 C 96.9935,30.25075 90.22475,23.482 90.22475,15.12575 C 90.22475,6.77075 96.9935,0.00075 105.34975,0.00075 C 108.09975,0.00075 110.6385,0.74075 112.85975,2.01075 M 23.0575,2.223 C 24.115,2.8555 24.75,4.01925 24.75,5.2905 C 24.75,7.298 23.16375,8.8855 21.26,8.8855 C 20.51999,8.8855 19.885,8.67425 19.35625,8.25175 C 18.08625,7.50925 16.60625,7.088 15.125,7.088 C 10.6825,7.088 7.08625,10.68425 7.08625,15.1255 C 7.08625,19.568 10.6825,23.1655 15.125,23.1655 C 18.72125,23.1655 21.78875,20.73175 22.74,17.453 L 27.28875,2.7505 C 27.71249,1.2705 29.08749,0.318 30.67374,0.318 L 44.31875,0.318 C 46.32875,0.318 47.915,1.90425 47.915,3.808 C 47.915,5.818 46.32875,7.4055 44.31875,7.4055 L 34.375,7.4055 C 33.74124,7.4055 33.21125,7.828 33.00125,8.358 L 29.61624,19.463 C 27.71249,25.70425 21.89375,30.25175 15.125,30.25175 C 6.76875,30.25175 0,23.483 0,15.1255 C 0,6.7705 6.76875,0.0005 15.125,0.0005 C 17.98125,0.0005 20.73,0.848 23.0575,2.223 M 43.78987,21.79013 L 43.78987,21.79013 L 49.71237,2.53888 C 50.13612,1.05888 51.51112,0.00013 53.09737,0.00013 L 53.41487,0.00013 L 53.83862,0.00013 C 55.42487,0.00013 56.79987,1.05888 57.22361,2.43388 L 61.34861,15.76013 L 65.26112,2.53888 C 65.68487,1.05888 67.05987,0.00013 68.75236,0.00013 L 69.06986,0.00013 L 69.49362,0.00013 C 71.07862,0.00013 72.45362,1.05888 72.87736,2.43388 L 79.96487,25.59763 C 80.06986,25.91388 80.06986,26.33763 80.06986,26.65513 C 80.06986,28.66638 78.48237,30.25138 76.57862,30.25138 C 74.99237,30.25138 73.61737,29.19513 73.19486,27.71388 L 69.06986,14.49263 L 65.04987,27.81888 C 64.62736,29.19513 63.25236,30.25138 61.66612,30.25138 L 61.24237,30.25138 L 60.92487,30.25138 C 59.33862,30.25138 57.96362,29.19513 57.53987,27.71388 L 53.52112,14.49263 L 49.60737,27.39513 C 49.07862,28.87763 47.80862,29.93513 46.11737,29.93513 L 32.47237,29.93513 C 30.56736,29.93513 28.98112,28.34763 28.98112,26.33763 C 28.98112,24.43388 30.56736,22.84763 32.47237,22.84763 L 42.41361,22.84763 C 43.04987,22.84763 43.57862,22.42388 43.78987,21.79013"
                        fill="#015F3D"
                    />
                </svg>
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
