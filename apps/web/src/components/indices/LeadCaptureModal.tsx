"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveIndexLead } from "@/app/actions/save-index-lead";
import Link from "next/link";
import { Loader2 } from "lucide-react";


interface LeadCaptureModalProps {
    isOpen: boolean;
    onClose: (proceed: boolean) => void; // proceed: true if submission successful, false if cancelled
}

export function LeadCaptureModal({ isOpen, onClose }: LeadCaptureModalProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [honeypot, setHoneypot] = useState(""); // Hidden field

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (honeypot) {
            // Bot detected, silently fail or fake success
            onClose(false);
            return;
        }

        if (!name.trim() || !email.trim()) {
            setError("Por favor, preencha todos os campos.");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError("E-mail inválido.");
            return;
        }

        setIsLoading(true);

        try {
            // Gather context data
            const searchParams = new URLSearchParams(window.location.search);

            const result = await saveIndexLead({
                name,
                email,
                source: `index_filter_gate`,
                page_url: window.location.href,
                user_agent: navigator.userAgent,
                attribution_data: {
                    referrer: document.referrer,
                    utm_source: searchParams.get("utm_source") || undefined,
                    utm_medium: searchParams.get("utm_medium") || undefined,
                    utm_campaign: searchParams.get("utm_campaign") || undefined,
                }
            });

            if (result.success) {
                // Client-side cookie is set by server action, but just in case we need immediate feedback?
                // Server action sets it.
                // Double check client side cookie existence? Not needed if server Set-Cookie works.
                onClose(true);
            } else {
                setError(result.error || "Ocorreu um erro. Tente novamente.");
            }
        } catch (err) {
            setError("Erro de conexão.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose(false)}>
            <DialogContent className="sm:max-w-[425px] text-start">
                {/* [&>button]:hidden hides the default close X to discourage dismissal without thought? 
                   Spec says "Results load only after submission or explicit dismissal."
                   If I hide X, they can still click outside (if not modal). 
                   DialogContent usually handles onEscape.
                   I will keep the X (default in Shadcn DialogContent) unless user really wants it forced.
                   "Modal overlays page... Background blurred/disabled."
                   "Cancelamento a qualquer momento."
                   I will allow X. Removing [&>button]:hidden
                */}
                <DialogHeader className="text-start">
                    <DialogTitle className="text-xl">Acesso gratuito aos dados completos</DialogTitle>
                    <DialogDescription className="space-y-3 pt-3 text-start">
                        <p>Para aplicar filtros avançados, confirme que você é humano.</p>
                        <div className="space-y-1">
                            <p className="font-medium text-foreground">Seu nome e e-mail nos ajudam a:</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Evitar bots e abusos</li>
                                <li>Enviar atualizações de novos índices</li>
                            </ul>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Prometemos: zero spam. Apenas conteúdo relevante.</p>
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Seu nome"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            disabled={isLoading}
                        />
                    </div>

                    {/* Honeypot */}
                    <div className="hidden">
                        <Input
                            tabIndex={-1}
                            autoComplete="off"
                            value={honeypot}
                            onChange={(e) => setHoneypot(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-destructive font-medium">{error}</p>
                    )}

                    <DialogFooter className="flex-col sm:flex-col gap-2 pt-2">
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar e aplicar filtros
                        </Button>
                        <div className="text-[10px] text-center text-muted-foreground leading-tight">
                            Ao continuar, você concorda em receber nossa newsletter.<br />
                            Cancelamento a qualquer momento.
                            <div className="mt-1">
                                <Link href="/politica-de-privacidade" className="underline hover:text-foreground">Política de Privacidade</Link>
                            </div>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
