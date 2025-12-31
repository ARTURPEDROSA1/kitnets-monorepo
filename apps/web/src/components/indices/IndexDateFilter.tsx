
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LeadCaptureModal } from "./LeadCaptureModal";

export interface IndexDateFilterProps {
    defaultStartDate?: string;
    defaultEndDate?: string;
}


export function IndexDateFilter({ defaultStartDate, defaultEndDate }: IndexDateFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Helpers for Date Formatting
    const toDisplayDate = (isoDate: string) => {
        if (!isoDate) return "";
        const [year, month, day] = isoDate.split("-");
        if (!year || !month || !day) return isoDate;
        return `${day}/${month}/${year}`;
    };

    const toIsoDate = (displayDate: string) => {
        if (!displayDate) return "";
        const [day, month, year] = displayDate.split("/");
        if (!day || !month || !year) return "";
        return `${year}-${month}-${day}`;
    };

    const applyDateMask = (value: string) => {
        return value
            .replace(/\D/g, "") // Remove non-digits
            .replace(/(\d{2})(\d)/, "$1/$2") // Add slash after 2nd digit
            .replace(/(\d{2})(\d)/, "$1/$2") // Add slash after 4th digit (2nd part)
            .replace(/(\d{4})\d+?$/, "$1"); // Cap at 4 digits for year
    };

    // Get initial values from URL or defaults
    const urlStartDate = searchParams.get("startDate");
    const urlEndDate = searchParams.get("endDate");

    // State holds the DISPLAY value (DD/MM/YYYY)
    const [startDate, setStartDate] = useState(toDisplayDate(urlStartDate || defaultStartDate || ""));
    const [endDate, setEndDate] = useState(toDisplayDate(urlEndDate || defaultEndDate || ""));

    const [showModal, setShowModal] = useState(false);

    const createQueryString = useCallback(
        (startIso: string, endIso: string) => {
            const params = new URLSearchParams(searchParams.toString());

            if (startIso) {
                params.set("startDate", startIso);
            } else {
                params.delete("startDate");
            }

            if (endIso) {
                params.set("endDate", endIso);
            } else {
                params.delete("endDate");
            }

            return params.toString();
        },
        [searchParams]
    );

    const applyFilter = () => {
        const startIso = toIsoDate(startDate);
        const endIso = toIsoDate(endDate);
        const queryString = createQueryString(startIso, endIso);
        router.push(`${pathname}?${queryString}`, { scroll: false });
    };

    const handleFilterClick = () => {
        const isVerified = getCookie("kitnets_lead_verified");
        if (isVerified) {
            applyFilter();
        } else {
            setShowModal(true);
        }
    };

    const handleClear = () => {
        setStartDate("");
        setEndDate("");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("startDate");
        params.delete("endDate");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStartDate(applyDateMask(e.target.value));
    };

    const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEndDate(applyDateMask(e.target.value));
    };

    return (
        <div className="bg-card border rounded-xl p-4 shadow-sm mb-6">
            <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="w-full md:w-auto flex-1 space-y-1.5">
                    <Label htmlFor="startDate" className="text-xs font-medium text-muted-foreground">Início do Período</Label>
                    <div className="relative">
                        <Input
                            type="text"
                            id="startDate"
                            placeholder="DD/MM/AAAA"
                            value={startDate}
                            onChange={handleStartChange}
                            maxLength={10}
                            className="w-full"
                        />
                    </div>
                </div>

                <div className="w-full md:w-auto flex-1 space-y-1.5">
                    <Label htmlFor="endDate" className="text-xs font-medium text-muted-foreground">Fim do Período</Label>
                    <div className="relative">
                        <Input
                            type="text"
                            id="endDate"
                            placeholder="DD/MM/AAAA"
                            value={endDate}
                            onChange={handleEndChange}
                            maxLength={10}
                            className="w-full"
                        />
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto pt-4 md:pt-0">
                    <Button onClick={handleFilterClick} className="flex-1 md:flex-none">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Filtrar
                    </Button>
                    {(startDate || endDate) && (
                        <Button variant="outline" onClick={handleClear} size="icon" title="Limpar filtros">
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <LeadCaptureModal
                isOpen={showModal}
                onClose={(success) => {
                    setShowModal(false);
                    if (success) {
                        applyFilter();
                    }
                }}
            />
        </div>
    );
}

function getCookie(name: string): string | undefined {
    if (typeof document === "undefined") return undefined;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}
