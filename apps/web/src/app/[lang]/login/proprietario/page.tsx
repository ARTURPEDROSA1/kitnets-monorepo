import Link from "next/link";
import { Button } from "@kitnets/ui";
import { getDictionary } from "../../../../dictionaries";

export default async function OwnerLoginPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
            <div className="w-full max-w-md space-y-8">
                <div className="bg-card border border-border rounded-xl shadow-lg p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-foreground">{dict.ownerLogin.title}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {dict.ownerLogin.subtitle}
                        </p>
                    </div>

                    <form className="space-y-6">
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
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-foreground">
                                {dict.login.password}
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-input rounded-md shadow-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end">
                            <div className="text-sm">
                                <a href="#" className="font-medium text-primary hover:text-primary/80">
                                    {dict.login.forgotPassword}
                                </a>
                            </div>
                        </div>

                        <div>
                            <Button type="submit" className="w-full flex justify-center py-2 px-4 shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90">
                                {dict.login.signIn}
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
                                    Ou
                                </span>
                            </div>
                        </div>

                        <div className="mt-6">
                            <Link href={lang === 'pt' ? '/signup/proprietario' : `/${lang}/signup/proprietario`} className="w-full">
                                <Button variant="outline" className="w-full">
                                    {dict.login.signUp}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-foreground max-w-3xl mx-auto space-y-8">
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">{dict.ownerLogin.whyRegisterTitle}</h3>
                        {dict.ownerLogin.intro?.map((paragraph: string, idx: number) => (
                            <p key={idx} className="text-muted-foreground mb-4 leading-relaxed">
                                {paragraph}
                            </p>
                        ))}
                    </div>

                    <div className="grid gap-8 md:grid-cols-2">
                        {dict.ownerLogin.benefits?.map((section: any, idx: number) => (
                            <div key={idx} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <h4 className="font-semibold text-lg mb-3 text-primary">{section.title}</h4>
                                {section.description && (
                                    <p className="text-sm text-muted-foreground mb-3">{section.description}</p>
                                )}
                                <ul className="space-y-2">
                                    {section.items?.map((item: string, i: number) => (
                                        <li key={i} className="flex items-start text-sm text-foreground">
                                            <span className="mr-2 text-green-500 font-bold">✓</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <div className="text-center bg-muted/30 p-8 rounded-xl border border-border mt-8">
                        <p className="text-lg font-medium text-foreground">
                            {dict.ownerLogin.cta}
                        </p>
                        <div className="mt-6">
                            <Link href={lang === 'pt' ? '/signup/proprietario' : `/${lang}/signup/proprietario`}>
                                <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 text-primary-foreground">
                                    {dict.login.signUp}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
