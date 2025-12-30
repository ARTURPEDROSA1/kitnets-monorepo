"use client";

interface Section {
    title: string;
    text?: string;
    list?: string[];
    conclusion?: string;
}

interface Content {
    intro: string;
    sections: Section[];
    finalText?: string;
}

export default function CalculatorContent({ content }: { content: Content }) {
    if (!content) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-12 py-12 text-slate-700 dark:text-slate-300 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <p className="text-lg md:text-xl leading-relaxed text-slate-800 dark:text-slate-50">
                {content.intro}
            </p>

            <div className="space-y-12">
                {content.sections?.map((section, idx) => (
                    <div key={idx} className="space-y-4">
                        <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                            {section.title}
                        </h3>
                        {section.text && (
                            <p className="text-base md:text-lg">{section.text}</p>
                        )}
                        {section.list && (
                            <ul className="list-disc pl-5 md:pl-6 space-y-2 marker:text-emerald-500">
                                {section.list.map((item, i) => (
                                    <li key={i} className="pl-1">{item}</li>
                                ))}
                            </ul>
                        )}
                        {section.conclusion && (
                            <p className="font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border-l-4 border-emerald-500">
                                {section.conclusion}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {content.finalText && (
                <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-lg md:text-xl font-semibold text-center text-slate-900 dark:text-slate-100 max-w-3xl mx-auto">
                        {content.finalText}
                    </p>
                </div>
            )}
        </div>
    );
}
