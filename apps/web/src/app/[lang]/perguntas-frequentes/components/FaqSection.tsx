'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { categories, faqData, FaqCategory } from '../faq-data';

function IconPlus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    );
}

function IconMinus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
        </svg>
    );
}

export function FaqSection() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentCategory = (searchParams.get('categoria') as FaqCategory) || 'Geral';

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const handleCategoryChange = (category: FaqCategory) => {
        setOpenIndex(null);
        const params = new URLSearchParams(searchParams.toString());
        params.set('categoria', category);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const filteredData = faqData.filter(item => {
        return item.category.toLowerCase() === currentCategory.toLowerCase();
    });

    const toggleAccordion = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8">
            {/* Category Navigation */}
            <div className="flex overflow-x-auto gap-2 pb-4 mb-8 no-scrollbar scroll-smooth">
                {categories.map((cat) => {
                    const isActive = currentCategory.toLowerCase() === cat.toLowerCase();
                    return (
                        <button
                            key={cat}
                            onClick={() => handleCategoryChange(cat)}
                            className={`
                 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors
                 ${isActive
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'}
               `}
                        >
                            {cat}
                        </button>
                    );
                })}
            </div>

            {/* FAQ List */}
            <div className="space-y-4">
                {filteredData.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">Nenhuma pergunta encontrada nesta categoria.</p>
                )}

                {filteredData.map((item, index) => {
                    const isOpen = openIndex === index;
                    const showInlineCta = index === 6;

                    return (
                        <div key={index} className="flex flex-col">
                            {/* Accordion Item */}
                            <div
                                className="border rounded-lg bg-card border-border overflow-hidden"
                            >
                                <button
                                    onClick={() => toggleAccordion(index)}
                                    className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-muted/30 transition-colors"
                                    aria-expanded={isOpen}
                                >
                                    <span className="text-base font-semibold text-foreground">
                                        {item.question}
                                    </span>
                                    <div className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} text-muted-foreground`}>
                                        {isOpen ? <IconMinus /> : <IconPlus />}
                                    </div>
                                </button>

                                <div
                                    className={`
                    transition-[max-height] duration-200 ease-in-out overflow-hidden
                    ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                  `}
                                >
                                    <div className="p-4 pt-0 text-muted-foreground text-sm leading-relaxed border-t border-transparent">
                                        {item.answer}
                                    </div>
                                </div>
                            </div>

                            {/* Inline Soft CTA */}
                            {showInlineCta && (
                                <div className="mt-4 mb-4 p-6 bg-muted/30 rounded-lg text-center border border-border">
                                    <h4 className="text-foreground font-medium mb-2">Não encontrou o que procurava?</h4>
                                    <p className="text-sm text-muted-foreground mb-4">Envie sua pergunta ou fale com a gente.</p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        <button
                                            onClick={() => document.getElementById('ask-form')?.scrollIntoView({ behavior: 'smooth' })}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
                                        >
                                            Fazer uma pergunta
                                        </button>
                                        <button
                                            onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })}
                                            className="px-4 py-2 bg-background border border-border text-foreground text-sm font-medium rounded-md hover:bg-accent transition-colors"
                                        >
                                            Entrar em contato
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
