"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, CheckCircle2 } from "lucide-react";
import { saveCalculatorSuggestion } from "@/app/actions/save-calculator-suggestion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CalculatorSuggestion() {
    const [suggestion, setSuggestion] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const pathname = usePathname();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!suggestion.trim()) return;

        setIsSubmitting(true);

        try {
            await saveCalculatorSuggestion({
                suggestion,
                email,
                location: pathname || "unknown"
            });
            setIsSent(true);
            setSuggestion("");
            setEmail("");
        } catch (error) {
            console.error("Error saving suggestion:", error);
            // Even if it fails, we might want to show success to the user or handle error
            // utilizing 'fail open' strategy for feedback forms often makes sense
            setIsSent(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSent) {
        return (
            <div className="bg-card border rounded-2xl p-8 md:p-12 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold">Obrigado pela sugestão!</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        Sua ideia foi registrada com sucesso. Estamos sempre trabalhando para melhorar o Kitnets.com e criar ferramentas que facilitem sua vida.
                    </p>
                </div>
                <Button variant="outline" onClick={() => setIsSent(false)}>
                    Enviar outra sugestão
                </Button>
            </div>
        );
    }

    return (
        <div className="bg-card border rounded-2xl p-8 md:p-12 shadow-sm space-y-8 text-center max-w-3xl mx-auto animate-in fade-in duration-700">
            <div className="space-y-4">
                <div className="mx-auto w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
                    <MessageSquarePlus className="w-6 h-6 text-foreground" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    Sentiu falta de alguma calculadora?
                </h2>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
                    Estamos construindo o Kitnets.com para você. Conte-nos qual ferramenta ajudaria na sua jornada imobiliária.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="text-left space-y-5 max-w-lg mx-auto bg-background p-1 rounded-xl">

                <div className="space-y-2">
                    <Label htmlFor="suggestion" className="pl-1">Qual calculadora você gostaria de ver aqui?</Label>
                    <textarea
                        id="suggestion"
                        placeholder="Ex: Calculadora de ROI para Airbnb, Simulador de Reforma, Venda vs Aluguel..."
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        value={suggestion}
                        onChange={(e) => setSuggestion(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email" className="pl-1">Seu e-mail (opcional)</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="Para avisarmos quando lançarmos"
                        className="bg-background"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <Button type="submit" size="lg" className="w-full font-semibold" disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Enviar Sugestão"}
                </Button>
            </form>
        </div>
    );
}
