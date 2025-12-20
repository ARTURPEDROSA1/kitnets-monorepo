'use client';

import { useState } from 'react';

export function SuggestLinkForm() {
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
                <h3 className="text-xl font-semibold text-emerald-800 dark:text-emerald-400 mb-2">Sugestão enviada!</h3>
                <p className="text-emerald-700 dark:text-emerald-500 mb-4">Obrigado por contribuir. Analisaremos sua sugestão em breve.</p>
                <button
                    onClick={() => setStatus('idle')}
                    className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 underline"
                >
                    Sugerir outro link
                </button>
            </div>
        );
    }

    return (
        <div id="suggest-link-form" className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm">
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground">Sugira um Link Útil</h3>
                <p className="text-sm text-muted-foreground">Conhece algum recurso importante que não está na lista? Compartilhe conosco.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seu Nome</label>
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
                        <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seu E-mail</label>
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
                    <label htmlFor="url" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Link (URL)</label>
                    <input
                        required
                        type="url"
                        id="url"
                        placeholder="https://exemplo.com.br"
                        className="w-full px-3 py-2 bg-background border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-foreground"
                    />
                </div>

                <div className="space-y-1">
                    <label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição (Opcional)</label>
                    <textarea
                        id="description"
                        rows={2}
                        placeholder="Por que este link é útil?"
                        className="w-full px-3 py-2 bg-background border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm resize-none text-foreground"
                    />
                </div>

                <div className="flex items-center justify-end pt-2">
                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        className="px-6 py-2 bg-foreground text-background font-medium rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {status === 'submitting' ? 'Enviando...' : 'Enviar Sugestão'}
                    </button>
                </div>
            </form>
        </div>
    );
}
