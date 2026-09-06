
"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function OwnerSignupPage({ lang }: { lang: "en" | "pt" | "es" }) {
    const { isLoaded, signUp, setActive } = useSignUp();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");

    const [verifying, setVerifying] = useState(false);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);

    // Step 1: Submit Sign Up form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || isSubmitting) return;

        if (password !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }

        setError("");
        setIsSubmitting(true);

        try {
            const nameParts = name.trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

            await signUp.create({
                emailAddress,
                password,
                firstName,
                lastName
            });

            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            setVerifying(true);
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            if (err.errors?.[0]?.code === "session_exists") {
                setError("Você já está logado. Redirecionando...");
                setTimeout(() => {
                    window.location.href = `/${lang}/dashboard`;
                }, 1000);
            } else {
                setError(err.errors?.[0]?.message || "Something went wrong during sign up");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Step 2: Verify Email Code
    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || isVerifyingCode) return;

        setError("");
        setIsVerifyingCode(true);

        try {
            const completeSignUp = await signUp.attemptEmailAddressVerification({
                code,
            });

            if (completeSignUp.status === "complete") {
                await setActive({
                    session: completeSignUp.createdSessionId,
                    redirectUrl: `/${lang}/dashboard`
                });

                // Create profile via server-side API (bypasses RLS issues with anon key)
                try {
                    const profileRes = await fetch('/api/profiles/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clerkId: completeSignUp.createdUserId,
                            fullName: name,
                            email: emailAddress
                        })
                    });
                    if (!profileRes.ok) {
                        const errData = await profileRes.json().catch(() => ({}));
                        console.error("Error creating profile:", errData);
                    }
                } catch (profileErr) {
                    console.error("Profile creation request failed:", profileErr);
                }

                window.location.href = `/${lang}/dashboard`;
            } else {
                console.error(JSON.stringify(completeSignUp, null, 2));
                setIsVerifyingCode(false);
            }
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            setError(err.errors?.[0]?.message || "Invalid verification code");
            setIsVerifyingCode(false);
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
                    <p className="text-center text-muted-foreground mb-3">Enviamos um código para <span className="font-semibold text-foreground">{emailAddress}</span></p>
                    <p className="text-center text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60 mb-6">
                        {lang === 'en'
                            ? "Didn't receive the email? Please check your spam or junk folder."
                            : lang === 'es'
                            ? "¿No recibiste el correo? Revisa también tu carpeta de spam o correo no deseado."
                            : "Não encontrou o código na caixa de entrada? Verifique também sua pasta de spam ou lixo eletrônico."}
                    </p>
                    <form onSubmit={handleVerify} className="space-y-4">
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder={dict.code}
                            className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground"
                        />
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        {/* Required by Clerk Bot Protection in production */}
                        <div id="clerk-captcha" />
                        <Button 
                            type="submit" 
                            disabled={isVerifyingCode || !isLoaded}
                            className="w-full flex justify-center items-center bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isVerifyingCode ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {lang === 'en' ? "Verifying..." : lang === 'es' ? "Verificando..." : "Verificando..."}
                                </>
                            ) : (
                                "Verificar"
                            )}
                        </Button>
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


                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        {/* Required by Clerk Bot Protection in production */}
                        <div id="clerk-captcha" />

                        <Button 
                            type="submit" 
                            disabled={isSubmitting || !isLoaded}
                            className="w-full flex justify-center items-center py-2 px-4 shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {lang === 'en' ? "Creating..." : lang === 'es' ? "Creando..." : "Criando..."}
                                </>
                            ) : (
                                dict.signup
                            )}
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
