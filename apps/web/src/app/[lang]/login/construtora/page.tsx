import Link from "next/link";
import { Button } from "@kitnets/ui";
import { getDictionary } from "../../../../dictionaries";
import LoginForm from "./LoginForm";

export default async function DeveloperLoginPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
            <div className="w-full max-w-md space-y-8">
                <div className="bg-card border border-border rounded-xl shadow-lg p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-foreground">{dict.developerLogin.title}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {dict.developerLogin.subtitle}
                        </p>
                    </div>

                    <LoginForm dict={dict} lang={lang} />

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
                            <Link href={lang === 'pt' ? '/signup/construtora' : `/${lang}/signup/construtora`} className="w-full">
                                <Button variant="outline" className="w-full">
                                    {dict.login.signUp}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-foreground max-w-3xl mx-auto space-y-8">
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">{dict.developerLogin.whyRegisterTitle}</h3>
                        {dict.developerLogin.intro?.map((paragraph: string, idx: number) => (
                            <p key={idx} className="text-muted-foreground mb-4 leading-relaxed">
                                {paragraph}
                            </p>
                        ))}
                    </div>

                    <div className="grid gap-8 md:grid-cols-2">
                        {dict.developerLogin.benefits?.map((section: any, idx: number) => (
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
                            {dict.developerLogin.cta}
                        </p>
                        <div className="mt-6">
                            <Link href={lang === 'pt' ? '/signup/construtora' : `/${lang}/signup/construtora`}>
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
