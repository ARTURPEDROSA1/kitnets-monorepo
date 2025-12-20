import { legalContent } from "./content";

export default async function LegalPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const content = legalContent[lang as keyof typeof legalContent] || legalContent.pt;

    return (
        <div className="flex min-h-screen flex-col items-center py-10">
            <main className="w-full max-w-4xl px-4 md:px-10 text-justify">
                <h1 className="text-3xl font-bold mb-6 text-foreground">{content.title}</h1>

                <p className="mb-4 text-foreground/80 leading-relaxed">
                    {content.intro}
                </p>

                <p className="mb-8 font-medium text-foreground">
                    {content.agreement}
                </p>

                <div className="space-y-8">
                    {content.sections.map((section, index) => (
                        <section key={index}>
                            <h2 className="text-xl font-semibold mb-3 text-foreground">{section.title}</h2>
                            <p className="mb-2 text-foreground/80">{section.content}</p>

                            {section.items && (
                                <ul className="list-disc pl-6 mb-4 space-y-1 text-foreground/80">
                                    {section.items.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            )}

                            {section.subContent && (
                                <div className="mt-4">
                                    <p className="mb-2 text-foreground/80">{section.subContent}</p>
                                    {section.subItems && (
                                        <ul className="list-disc pl-6 mb-4 space-y-1 text-foreground/80">
                                            {section.subItems.map((item, idx) => (
                                                <li key={idx}>{item}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {section.footer && (
                                <p className="text-sm italic text-muted-foreground mt-2">
                                    {section.footer}
                                </p>
                            )}

                            {section.contact && (
                                <p className="mt-2 text-foreground font-medium">
                                    {section.contact}
                                </p>
                            )}
                        </section>
                    ))}
                </div>

                <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
                    <p>{content.lastUpdate}</p>
                </div>
            </main>
        </div>
    );
}
