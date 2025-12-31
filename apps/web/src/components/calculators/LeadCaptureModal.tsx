"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { Loader2 } from "lucide-react";
import { saveCalculatorLead } from "@/app/actions/save-calculator-lead";

interface LeadCaptureModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    calculatorType: string; // Acts as 'source'
    leadMetadata?: {
        leadType: string;
        triggerType: string; // advanced, export, time
        interactionCount: number;
        engagedSeconds: number;
        exportType?: string; // pdf, csv, copy, print
    };
}

export default function LeadCaptureModal({
    open,
    onOpenChange,
    calculatorType,
    leadMetadata,
}: LeadCaptureModalProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        setIsLoading(true);

        // Capture Location
        let locationData = {};
        try {
            if ("geolocation" in navigator) {
                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                    });
                }).catch(() => null);

                if (position) {
                    locationData = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp,
                    };
                }
            }
        } catch (err) {
            console.warn("Could not capture location:", err);
            // Continue without location
        }

        // Gather Context Data
        const searchParams = new URLSearchParams(window.location.search);
        const attributionData = {
            referrer: document.referrer,
            utm_source: searchParams.get("utm_source") || undefined,
            utm_medium: searchParams.get("utm_medium") || undefined,
            utm_campaign: searchParams.get("utm_campaign") || undefined,
        };

        const res = await saveCalculatorLead({
            name,
            email,
            source: calculatorType,
            lead_type: leadMetadata?.leadType || "generic_calculator_gate", // Fallback
            page_url: window.location.href,
            user_agent: navigator.userAgent,
            attribution_data: attributionData,
            metadata: {
                trigger_type: leadMetadata?.triggerType,
                interaction_count: leadMetadata?.interactionCount,
                engaged_seconds: leadMetadata?.engagedSeconds,
                export_type: leadMetadata?.exportType,
            },
            location: locationData,
        });

        setIsLoading(false);

        if (res.success) {
            onOpenChange(false);
        } else {
            setError(res.error || "Erro ao salvar. Tente novamente.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md backdrop-blur-sm" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="text-center">Desbloquear Análise Completa</DialogTitle>
                    <DialogDescription className="text-center pt-2">
                        Identificamos que você está personalizando sua simulação.
                        <br />
                        Para continuar explorando os resultados detalhados,
                        precisamos confirmar que você não é um robô.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="lead-name">Nome</Label>
                        <Input
                            id="lead-name"
                            placeholder="Seu nome"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lead-email">E-mail</Label>
                        <Input
                            id="lead-email"
                            type="email"
                            placeholder="seu@email.com"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 font-medium text-center">{error}</p>
                    )}

                    <div className="pt-2">
                        <Button type="submit" disabled={isLoading} className="w-full">
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar e Continuar
                        </Button>
                    </div>

                    <div className="pt-2 text-center">
                        <p className="text-xs text-muted-foreground">
                            Você será adicionado à nossa newsletter com dicas e novos simuladores.
                            <br />
                            Cancelamento a qualquer momento. Zero spam.
                        </p>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
