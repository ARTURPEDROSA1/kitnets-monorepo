'use client';

import { useState } from 'react';

export function AskForm() {
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');
        // Simulate network request
        setTimeout(() => {
            setStatus('success');
        }, 1500);
    };

    if (status === 'success') {
        return (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-lg p-8 text-center animate-in fade-in zoom-in duration-300">
                <h3 className="text-xl font-semibold text-emerald-800 dark:text-emerald-400 mb-2">Recebemos sua pergunta!</h3>
                <p className="text-emerald-700 dark:text-emerald-500 mb-4">Em breve ela poderá aparecer no FAQ. Obrigado por contribuir.</p>
                <button
                    onClick={() => setStatus('idle')}
                    className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 underline"
                >
                    Enviar outra pergunta
                </button>
            </div>
        );
    }

    return (
        <div id="ask-form" className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm">
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground">Ainda tem dúvidas?</h3>
                <p className="text-sm text-muted-foreground">Envie sua pergunta para nossa equipe. Ela pode ajudar outros usuários futuramente.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</label>
                        <input
                            required
                            autoComplete="name"
                            type="text"
                            id="name"
                            placeholder="Seu nome"
                            className="w-full px-3 py-2 bg-background border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-foreground"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mail</label>
                        <input
                            required
                            autoComplete="email"
                            type="email"
                            id="email"
                            placeholder="seu@email.com"
                            className="w-full px-3 py-2 bg-background border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-foreground"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label htmlFor="question" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sua pergunta</label>
                    <textarea
                        required
                        id="question"
                        rows={3}
                        placeholder="O que você gostaria de saber?"
                        className="w-full px-3 py-2 bg-background border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm resize-none text-foreground"
                    />
                </div>

                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                        Ao enviar, você concorda com nossa <a href="#" className="underline hover:text-foreground">Política de Privacidade</a>.
                    </p>
                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        className="px-6 py-2 bg-foreground text-background font-medium rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {status === 'submitting' ? 'Enviando...' : 'Enviar Pergunta'}
                    </button>
                </div>
            </form>
        </div>
    );
}
