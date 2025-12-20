"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { Search, Megaphone, LayoutDashboard, User, Building2, HardHat, KeyRound, Loader2, CheckCircle2 } from "lucide-react";

type Intent = 'find' | 'list' | 'manage';
type Role = 'owner' | 'broker' | 'agency' | 'developer';

interface OnboardingWizardProps {
    t: any;
    lang: string;
}

export function OnboardingWizard({ t, lang }: OnboardingWizardProps) {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [intent, setIntent] = useState<Intent | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const handleIntentSelect = (selectedIntent: Intent) => {
        setIntent(selectedIntent);
        if (selectedIntent === 'find') {
            setStep(3); // Skip role
        } else {
            // Pre-select 'owner' if 'list', but let user change or confirm? 
            // The prompt says "Defaults: Anunciar -> Proprietário preselected".
            // We'll set it but show the step for confirmation if they are a broker.
            if (selectedIntent === 'list') setRole('owner');
            setStep(2);
        }
    };

    const handleRoleSelect = (selectedRole: Role) => {
        setRole(selectedRole);
        setStep(3);
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock analytics event
        console.log({
            event: 'signup_completed',
            intent,
            role,
            email,
            email_confirmed: true // simulated for magic link flow
        });

        localStorage.setItem('kitnets_user_email', email);

        setLoading(false);
        setStep(4);

        // Redirect
        setTimeout(() => {
            let path = '/';
            // Determine base path
            if (intent === 'find') path = '/alugar';
            else if (intent === 'list') path = '/anunciar';
            else if (intent === 'manage') path = '/login/proprietario';

            // Function to build multilingual path
            let finalPath = lang === 'pt' ? path : `/${lang}${path}`;

            // Add query params for "Anunciar" to skip to Step 2
            if (intent === 'list') {
                const params = new URLSearchParams();
                params.set('step', 'intent'); // Step 2 (Intent) in AnunciarFlow is mapped to 'intent' stepId
                if (role) params.set('role', role);
                if (email) params.set('email', email); // Pass email to skip Contact step
                finalPath += `?${params.toString()}`;
            }

            router.push(finalPath);
        }, 2500);
    };

    // Step 1: Intent
    if (step === 1) {
        return (
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.intent.title}</h1>
                </div>

                <div className="grid gap-4">
                    <button
                        onClick={() => handleIntentSelect('find')}
                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-emerald-500 transition-all text-left group shadow-sm hover:shadow-emerald-500/20"
                    >
                        <div className="p-3 rounded-lg bg-blue-900/30 text-blue-400 group-hover:scale-110 transition-transform">
                            <Search className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="font-semibold text-white text-lg">{t.intent.options.find.label}</div>
                            <div className="text-sm text-zinc-400">{t.intent.options.find.description}</div>
                        </div>
                    </button>

                    <button
                        onClick={() => handleIntentSelect('list')}
                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-emerald-500 transition-all text-left group shadow-sm hover:shadow-emerald-500/20"
                    >
                        <div className="p-3 rounded-lg bg-green-900/30 text-green-400 group-hover:scale-110 transition-transform">
                            <Megaphone className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="font-semibold text-white text-lg">{t.intent.options.list.label}</div>
                            <div className="text-sm text-zinc-400">{t.intent.options.list.description}</div>
                        </div>
                    </button>

                    <button
                        onClick={() => handleIntentSelect('manage')}
                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-emerald-500 transition-all text-left group shadow-sm hover:shadow-emerald-500/20"
                    >
                        <div className="p-3 rounded-lg bg-purple-900/30 text-purple-400 group-hover:scale-110 transition-transform">
                            <LayoutDashboard className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="font-semibold text-white text-lg">{t.intent.options.manage.label}</div>
                            <div className="text-sm text-zinc-400">{t.intent.options.manage.description}</div>
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    // Step 2: Role
    if (step === 2) {
        return (
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.role.question}</h1>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleRoleSelect('owner')}
                        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border ${role === 'owner' ? 'border-emerald-500 ring-1 ring-emerald-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'} hover:border-emerald-500 hover:bg-zinc-800 transition-all text-center group shadow-sm`}
                    >
                        <KeyRound className="w-8 h-8 text-orange-500 mb-1" />
                        <span className="font-medium text-white">{t.role.options.owner}</span>
                    </button>

                    <button
                        onClick={() => handleRoleSelect('broker')}
                        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border ${role === 'broker' ? 'border-emerald-500 ring-1 ring-emerald-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'} hover:border-emerald-500 hover:bg-zinc-800 transition-all text-center group shadow-sm`}
                    >
                        <User className="w-8 h-8 text-blue-500 mb-1" />
                        <span className="font-medium text-white">{t.role.options.broker}</span>
                    </button>

                    <button
                        onClick={() => handleRoleSelect('agency')}
                        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border ${role === 'agency' ? 'border-emerald-500 ring-1 ring-emerald-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'} hover:border-emerald-500 hover:bg-zinc-800 transition-all text-center group shadow-sm`}
                    >
                        <Building2 className="w-8 h-8 text-green-500 mb-1" />
                        <span className="font-medium text-white">{t.role.options.agency}</span>
                    </button>

                    <button
                        onClick={() => handleRoleSelect('developer')}
                        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border ${role === 'developer' ? 'border-emerald-500 ring-1 ring-emerald-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'} hover:border-emerald-500 hover:bg-zinc-800 transition-all text-center group shadow-sm`}
                    >
                        <HardHat className="w-8 h-8 text-yellow-500 mb-1" />
                        <span className="font-medium text-white">{t.role.options.developer}</span>
                    </button>
                </div>

                <button onClick={() => setStep(1)} className="w-full text-sm text-muted-foreground hover:text-foreground mt-4">
                    ← {t.menu?.back || "Voltar"}
                </button>
            </div>
        );
    }

    // Step 3 & 4: Value + Email
    if (step === 3) {
        const values = t.value[intent || 'find'] || [];

        return (
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-6">
                    <div>
                        <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">{t.value.prefix}</h2>
                        <ul className="space-y-3">
                            {values.map((val: string, i: number) => (
                                <li key={i} className="flex items-center gap-3 text-lg text-foreground">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    <span>{val}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="pt-6 border-t border-border">
                        <div className="text-center mb-6">
                            <h1 className="text-2xl font-bold text-foreground">{t.email.title}</h1>
                        </div>

                        <form onSubmit={handleEmailSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <input
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    required
                                    placeholder={t.email.placeholder}
                                    className="w-full px-4 py-3 rounded-lg border border-input bg-background/50 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-lg"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground text-center">{t.email.helper}</p>
                            </div>

                            <Button type="submit" size="lg" className="w-full text-lg h-12" disabled={loading}>
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t.email.cta}
                            </Button>
                        </form>
                    </div>
                </div>

                <button onClick={() => setStep(intent === 'find' ? 1 : 2)} className="w-full text-sm text-muted-foreground hover:text-foreground">
                    ← {t.menu?.back || "Voltar"}
                </button>
            </div>
        );
    }

    // Step 4: Success
    if (step === 4) {
        return (
            <div className="w-full max-w-md text-center space-y-6 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>

                <h1 className="text-3xl font-bold text-foreground">{t.success.title}</h1>
                <p className="text-xl text-muted-foreground">
                    {t.success.message}
                </p>

                <div className="pt-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    return null;
}
