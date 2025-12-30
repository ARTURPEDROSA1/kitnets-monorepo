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
    calculatorType: string;
}

export default function LeadCaptureModal({
    open,
    onOpenChange,
    calculatorType,
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

        const res = await saveCalculatorLead({
            name,
            email,
            calculatorType,
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
        <Dialog open={open} onOpenChange={(val) => {
            // Prevent closing by clicking outside if strictly forced? 
            // The prompt doesn't say "forced", but implies interruption. 
            // We'll allow closing but it might pop up again if logic dictates, 
            // or we consider "closing" as "refusal" and reset counter?
            // For now, let's allow standard dialog behavior.
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Desbloqueie o potencial total</DialogTitle>
                    <DialogDescription>
                        Para continuar utilizando nossas calculadoras gratuitamente, precisamos apenas que você se identifique.
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
                        <p className="text-[11px] text-muted-foreground">
                            Prometemos zero spam. Você será notificado apenas quando lançarmos novas ferramentas úteis.
                        </p>
                    </div>

                    <div className="pt-2">
                        <p className="text-xs text-muted-foreground text-center">
                            Precisamos do seu nome e e-mail apenas para confirmar que você é humano.
                        </p>
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 font-medium">{error}</p>
                    )}

                    <div className="pt-2 flex justify-end">
                        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Continuar usando
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
