import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Calendar, Clock, Wallet, TrendingUp, Scale, Building2, AlertTriangle, FileText,
    BadgePercent, Coins, ArrowRight, DollarSign, Globe, ArrowUpRight
} from 'lucide-react';

export const Callout = ({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warning' | 'error' | 'success' }) => {
    const colors = {
        info: 'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
        warning: 'bg-yellow-50 border-yellow-500 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
        error: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-100',
        success: 'bg-green-50 border-green-500 text-green-900 dark:bg-green-950 dark:text-green-100',
    };
    return (
        <div className={`p-4 border-l-4 rounded my-4 ${colors[type]}`}>
            {children}
        </div>
    );
};

export const CTA = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} className="inline-block px-6 py-3 bg-primary text-primary-foreground font-bold rounded hover:opacity-90 transition">
        {children}
    </a>
);

export const FAQ = ({ items }: { items: { question: string; answer: string }[] }) => (
    <div className="space-y-4 my-6">
        {items.map((item, idx) => (
            <details key={idx} className="group border rounded bg-card p-4">
                <summary className="font-semibold cursor-pointer list-none flex justify-between items-center text-foreground">
                    {item.question}
                    <span className="transition group-open:rotate-180">▼</span>
                </summary>
                <div className="mt-2 text-muted-foreground">{item.answer}</div>
            </details>
        ))}
    </div>
);

// Map
export const COMPONENTS = {
    Callout,
    CTA,
    FAQ,
    Link,
    Image,
    Calendar, Clock, Wallet, TrendingUp, Scale, Building2, AlertTriangle, FileText,
    BadgePercent, Coins, ArrowRight, DollarSign, Globe, ArrowUpRight,
};
