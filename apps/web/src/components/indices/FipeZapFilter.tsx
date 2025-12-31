"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { LeadCaptureModal } from "./LeadCaptureModal";

export interface FipeZapFilterProps {
    defaultType?: string;
    defaultBedrooms?: string;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

export function FipeZapFilter({
    defaultType = "locacao",
    defaultBedrooms = "todos",
    defaultStartDate = "2015-01-01",
    defaultEndDate = ""
}: FipeZapFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Get initial values from URL or defaults
    const urlType = searchParams.get("type");
    const urlBedrooms = searchParams.get("bedrooms");
    const urlStartDate = searchParams.get("startDate");
    const urlEndDate = searchParams.get("endDate");

    const [type, setType] = useState(urlType || defaultType);
    const [bedrooms, setBedrooms] = useState(urlBedrooms || defaultBedrooms);
    const [startDate, setStartDate] = useState(urlStartDate || defaultStartDate);
    const [endDate, setEndDate] = useState(urlEndDate || defaultEndDate);

    // Check if dirty state (different from URL) for "Apply" button visualization? 
    // Spec says "When user clicks Apply". 

    const [showModal, setShowModal] = useState(false);

    const createQueryString = useCallback(
        (t: string, b: string, s: string, e: string) => {
            const params = new URLSearchParams(searchParams.toString());

            // Type
            if (t && t !== "locacao") params.set("type", t);
            else params.delete("type");

            // Bedrooms
            if (b && b !== "todos") params.set("bedrooms", b);
            else params.delete("bedrooms");

            // Dates
            if (s && s !== "2015-01-01") params.set("startDate", s);
            else params.delete("startDate"); // Assuming default logic handles missing param

            if (e) params.set("endDate", e);
            else params.delete("endDate");

            return params.toString();
        },
        [searchParams]
    );

    const applyFilter = () => {
        const queryString = createQueryString(type, bedrooms, startDate, endDate);
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
        setType("locacao");
        setBedrooms("todos");
        setStartDate("2015-01-01");
        setEndDate("");

        // Clear URL
        const params = new URLSearchParams(searchParams.toString());
        params.delete("type");
        params.delete("bedrooms");
        params.delete("startDate");
        params.delete("endDate");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (

        <div className="bg-card border rounded-xl p-4 shadow-sm">
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Start Date */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Início do Período</Label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            max={endDate || undefined}
                        />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Fim do Período</Label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={startDate || undefined}
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="locacao">Locação</SelectItem>
                                <SelectItem value="venda">Venda</SelectItem>
                                <SelectItem value="yield">Yield</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Bedrooms */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Dormitórios</Label>
                        <Select value={bedrooms} onValueChange={setBedrooms}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                <SelectItem value="1">1 Dormitório</SelectItem>
                                <SelectItem value="2">2 Dormitórios</SelectItem>
                                <SelectItem value="3">3 Dormitórios</SelectItem>
                                <SelectItem value="4">4+ Dormitórios</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t mt-1">
                    <Button onClick={handleFilterClick} className="flex-1 md:flex-none md:w-32 bg-primary">
                        <Filter className="mr-2 h-4 w-4" />
                        Aplicar
                    </Button>
                    <Button variant="ghost" onClick={handleClear} size="sm" className="text-muted-foreground hover:text-foreground">
                        Limpar filtros
                    </Button>
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
