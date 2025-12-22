
"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@kitnets/ui";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function LoginForm({ dict, lang }: { dict: any; lang: string }) {
    const { isLoaded, signIn, setActive } = useSignIn();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded) return;

        try {
            const result = await signIn.create({
                identifier: email,
                password,
            });

            if (result.status === "complete") {
                await setActive({ session: result.createdSessionId });
                router.push("/dashboard");
            } else {
                console.error(JSON.stringify(result, null, 2));
            }
        } catch (err: any) {
            console.error(JSON.stringify(err, null, 2));
            if (err.errors?.[0]?.code === "session_exists") {
                setError("Você já está logado. Redirecionando...");
                setTimeout(() => router.push("/dashboard"), 1000);
            } else {
                setError(err.errors?.[0]?.message || "Invalid email or password");
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                    {dict.login.email}
                </label>
                <div className="mt-1">
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                    />
                </div>
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    {dict.login.password}
                </label>
                <div className="relative mt-1">
                    <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm pr-10"
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

            <div className="flex items-center justify-end">
                <div className="text-sm">
                    <a href={lang === 'pt' ? '/forgot-password' : `/${lang}/forgot-password`} className="font-medium text-primary hover:text-primary/80">
                        {dict.login.forgotPassword}
                    </a>
                </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div>
                <Button type="submit" className="w-full flex justify-center py-2 px-4 shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90">
                    {dict.login.signIn}
                </Button>
            </div>
        </form>
    );
}
