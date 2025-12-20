'use client';

import { useState } from 'react';

export function ContactForm() {
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');
        setTimeout(() => {
            setStatus('success');
        }, 1500);
    };

    if (status === 'success') {
        return (
            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border">
                <h3 className="text-lg font-medium text-foreground">Mensagem enviada!</h3>
                <p className="text-muted-foreground mt-1">Nossa equipe entrará em contato em breve.</p>
                <button
                    onClick={() => setStatus('idle')}
                    className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                    Enviar nova mensagem
                </button>
            </div>
        );
    }

    return (
        <div id="contact-form" className="mt-12 py-8 border-t border-border">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground">Fale Conosco</h2>
                <p className="text-muted-foreground mt-2">Para assuntos mais específicos ou suporte direto.</p>
            </div>

            <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="contact-name" className="block text-sm font-medium text-foreground">
                                Nome
                            </label>
                            <input
                                required
                                autoComplete="name"
                                type="text"
                                id="contact-name"
                                className="w-full px-3 py-2 bg-background border border-input rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-foreground"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="contact-email" className="block text-sm font-medium text-foreground">
                                E-mail
                            </label>
                            <input
                                required
                                autoComplete="email"
                                type="email"
                                id="contact-email"
                                className="w-full px-3 py-2 bg-background border border-input rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-foreground"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="subject" className="block text-sm font-medium text-foreground">
                            Assunto
                        </label>
                        <select
                            id="subject"
                            className="w-full px-3 py-2 bg-background border border-input rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-foreground"
                        >
                            <option>Suporte</option>
                            <option>Parcerias</option>
                            <option>Comercial</option>
                            <option>Jurídico</option>
                            <option>Outro</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="message" className="block text-sm font-medium text-foreground">
                            Mensagem
                        </label>
                        <textarea
                            required
                            id="message"
                            rows={4}
                            className="w-full px-3 py-2 bg-background border border-input rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y text-foreground"
                        />
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <button
                            type="submit"
                            disabled={status === 'submitting'}
                            className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-md transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'submitting' ? 'Enviando...' : 'Enviar Mensagem'}
                        </button>
                        <p className="text-xs text-muted-foreground">
                            Nossa equipe responde em até 2 dias úteis.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
