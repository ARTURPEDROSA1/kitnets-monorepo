
"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function OwnerSignupPage({ lang }: { lang: "en" | "pt" | "es" }) {
    const { isLoaded, signUp, setActive } = useSignUp();
    const router = useRouter();
    const supabase = createClient();

    const [emailAddress, setEmailAddress] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");
    const [gatewayCode, setGatewayCode] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Step 1: Submit Sign Up form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded) return;

        if (password !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }

        try {
            await signUp.create({
                emailAddress,
                password,
            });

            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            setVerifying(true);
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            if (err.errors?.[0]?.code === "session_exists") {
                setError("Você já está logado. Redirecionando...");
                setTimeout(() => router.push("/dashboard"), 2000);
            } else {
                setError(err.errors?.[0]?.message || "Something went wrong during sign up");
            }
        }
    };

    // Step 2: Verify Email Code
    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded) return;

        try {
            const completeSignUp = await signUp.attemptEmailAddressVerification({
                code,
            });

            if (completeSignUp.status === "complete") {
                await setActive({ session: completeSignUp.createdSessionId });

                // Create profile in Supabase
                const { error: dbError } = await supabase.from('profiles').insert({
                    clerk_id: completeSignUp.createdUserId,
                    role: 'landlord',
                    full_name: name,
                    email: emailAddress
                });

                if (dbError) console.error("Error creating profile:", dbError);

                // If gateway code is provided, try to claim it (Logic to be implemented in API)
                if (gatewayCode) {
                    await fetch('/api/gateways/claim', {
                        method: 'POST',
                        body: JSON.stringify({ code: gatewayCode, userId: completeSignUp.createdUserId })
                    });
                }

                router.push("/dashboard");
            } else {
                console.error(JSON.stringify(completeSignUp, null, 2));
            }
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            setError(err.errors?.[0]?.message || "Invalid verification code");
        }
    };

    // Dictionary (mock for client component usage or pass as prop)
    const dict = {
        title: "Crie sua conta de Proprietário",
        subtitle: "Gerencie seus imóveis e monitore o consumo em tempo real.",
        name: "Nome Completo",
        email: "Email",
        password: "Senha",
        confirmPassword: "Confirmar Senha",
        gateway: "Código do Gateway (Opcional)",
        gatewayHelp: "Insira o código localizado na etiqueta do seu Gateway Kitnet.",
        signup: "Criar Conta",
        verify: "Verificar Email",
        login: "Fazer Login",
        accountExist: "Já tem uma conta?",
        code: "Código de Verificação"
    };

    if (verifying) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
                <div className="w-full max-w-md space-y-8 bg-card p-8 rounded-xl border border-border">
                    <h2 className="text-2xl font-bold text-center mb-4">{dict.verify}</h2>
                    <p className="text-center text-muted-foreground mb-6">Enviamos um código para {emailAddress}</p>
                    <form onSubmit={handleVerify} className="space-y-4">
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder={dict.code}
                            className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground"
                        />
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <Button type="submit" className="w-full bg-primary text-white">Verificar</Button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-foreground">{dict.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{dict.subtitle}</p>
                </div>

                <div className="mt-8 bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-border">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-foreground">{dict.name}</label>
                            <input
                                type="text"
                                name="name"
                                autoComplete="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground bg-white dark:bg-neutral-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground">{dict.email}</label>
                            <input
                                type="email"
                                name="email"
                                autoComplete="email"
                                required
                                value={emailAddress}
                                onChange={(e) => setEmailAddress(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground bg-white dark:bg-neutral-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground">{dict.password}</label>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    autoComplete="new-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground bg-white dark:bg-neutral-900 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground">{dict.confirmPassword}</label>
                            <div className="relative mt-1">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    name="confirmPassword"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground bg-white dark:bg-neutral-900 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground">{dict.gateway}</label>
                            <input
                                type="text"
                                name="gateway_code"
                                value={gatewayCode}
                                onChange={(e) => setGatewayCode(e.target.value)}
                                placeholder="ex: GW-1234-5678"
                                className="mt-1 block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground bg-white dark:bg-neutral-900"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">{dict.gatewayHelp}</p>
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <Button type="submit" className="w-full flex justify-center py-2 px-4 shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90">
                            {dict.signup}
                        </Button>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-card text-muted-foreground">{dict.accountExist}</span>
                            </div>
                        </div>

                        <div className="mt-6">
                            <a href={`/${lang}/login/proprietario`} className="flex w-full justify-center rounded-md border border-border bg-background py-2 px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50">
                                {dict.login}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
