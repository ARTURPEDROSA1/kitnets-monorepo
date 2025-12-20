
import { Link } from "lucide-react";
import { Button } from "@kitnets/ui";
import { getDictionary } from "../../../../dictionaries";

export default async function OwnerSignupPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-foreground">
                        Crie sua conta de Proprietário
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Gerencie seus imóveis e monitore o consumo em tempo real.
                    </p>
                </div>

                <div className="mt-8 bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-border">
                    {/* Placeholder for Clerk SignUp Component */}
                    {/* In a real implementation with Clerk, you would mount <SignUp /> here */}
                    {/* or a custom form that hits the Clerk API */}

                    <form className="space-y-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-foreground">
                                Nome Completo
                            </label>
                            <div className="mt-1">
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    autoComplete="name"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-foreground">
                                Email
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-foreground">
                                Senha
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                        </div>

                        {/* Gateway Integration Field - Optional during Signup */}
                        <div>
                            <label htmlFor="gateway_code" className="block text-sm font-medium text-foreground">
                                Código do Gateway (Opcional)
                            </label>
                            <div className="mt-1">
                                <input
                                    id="gateway_code"
                                    name="gateway_code"
                                    type="text"
                                    placeholder="ex: GW-1234-5678"
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Insira o código localizado na etiqueta do seu Gateway Kitnet.
                            </p>
                        </div>

                        <div>
                            <Button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                                Criar Conta
                            </Button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-card text-muted-foreground">
                                    Já tem uma conta?
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-3">
                            <a href={`/${lang}/login/proprietario`} className="w-full flex justify-center py-2 px-4 border border-border rounded-md shadow-sm bg-background text-sm font-medium text-foreground hover:bg-muted/50">
                                Fazer Login
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
