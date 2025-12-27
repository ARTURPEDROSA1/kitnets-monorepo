
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function IndexDateFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Get initial values from URL or defaults
    const initialStartDate = searchParams.get("startDate") || "";
    const initialEndDate = searchParams.get("endDate") || "";


    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);

    const createQueryString = useCallback(
        (start: string, end: string) => {
            const params = new URLSearchParams(searchParams.toString());

            if (start) {
                params.set("startDate", start);
            } else {
                params.delete("startDate");
            }

            if (end) {
                params.set("endDate", end);
            } else {
                params.delete("endDate");
            }

            return params.toString();
        },
        [searchParams]
    );

    const handleFilter = () => {
        const queryString = createQueryString(startDate, endDate);
        router.push(`${pathname}?${queryString}`, { scroll: false });
    };

    const handleClear = () => {
        setStartDate("");
        setEndDate("");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("startDate");
        params.delete("endDate");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="bg-card border rounded-xl p-4 shadow-sm mb-6">
            <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="w-full md:w-auto flex-1 space-y-1.5">
                    <Label htmlFor="startDate" className="text-xs font-medium text-muted-foreground">Início do Período</Label>
                    <div className="relative">
                        <Input
                            type="date"
                            id="startDate"
                            value={startDate}
                            max={endDate || undefined}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>

                <div className="w-full md:w-auto flex-1 space-y-1.5">
                    <Label htmlFor="endDate" className="text-xs font-medium text-muted-foreground">Fim do Período</Label>
                    <div className="relative">
                        <Input
                            type="date"
                            id="endDate"
                            value={endDate}
                            min={startDate || undefined}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto pt-4 md:pt-0">
                    <Button onClick={handleFilter} className="flex-1 md:flex-none">
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
        </div>
    );
}
