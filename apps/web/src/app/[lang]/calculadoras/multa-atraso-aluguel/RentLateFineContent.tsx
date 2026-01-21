
import React from 'react';

type Language = 'en' | 'pt' | 'es';

interface Content {
    title: string;
    intro: string;
    calcContext: string;
    useCases: {
        title: string;
        items: string[];
    };
    doubts: {
        title: string;
        items: string[];
    };
    howItWorks: {
        title: string;
        intro: string;
        items: string[];
    };
    proRata: {
        title: string;
        text: string;
    };
    multipleRents: {
        title: string;
        intro: string;
        items: string[];
        explanation: string;
        resultsIntro: string;
        resultsItems: string[];
    };
    clearResults: {
        title: string;
        intro: string;
        items: string[];
        facilitatesIntro: string;
        facilitatesItems: string[];
    };
    examples: {
        title: string;
        items: string[];
        conclusion: string;
    };
    disclaimer: {
        title: string;
        text: string[];
    };
    whyUse: {
        title: string;
        items: string[];
        conclusion: string;
    };
}

const contentData: Record<Language, Content> = {
    pt: {
        title: "Calculadora de Multa de Atraso no Pagamento de Aluguel",
        intro: "A Calculadora de Multa de Atraso no Pagamento de Aluguel do Kitnets.com permite calcular de forma rápida, transparente e precisa multas e juros de mora aplicáveis a aluguéis pagos em atraso, exatamente como previsto nos contratos de locação mais utilizados no Brasil.",
        calcContext: "Com poucos dados, você descobre quanto realmente deve pagar ou cobrar, considerando pró-rata por dia, diferentes regras de juros e várias parcelas em atraso ao mesmo tempo — algo essencial em casos de inadimplência recorrente.",
        useCases: {
            title: "Para que serve a calculadora de multa por atraso no aluguel?",
            items: [
                "Locatários que querem saber o valor correto do aluguel atrasado antes de pagar",
                "Locadores que precisam calcular multas e juros de forma justa e documentada",
                "Imobiliárias que fazem cobranças administrativas ou extrajudiciais",
                "Advogados e administradores de imóveis que precisam de valores claros e auditáveis"
            ]
        },
        doubts: {
            title: "Ela elimina dúvidas comuns como:",
            items: [
                "A multa é aplicada uma única vez ou por mês?",
                "O juro é de 1% ao mês ou 0,10% ao dia?",
                "Como funciona o cálculo pró-rata?",
                "O que acontece quando há mais de um aluguel vencido?"
            ]
        },
        howItWorks: {
            title: "Como funciona o cálculo da multa e dos juros de aluguel atrasado?",
            intro: "A calculadora segue as cláusulas mais comuns encontradas em contratos de locação residencial e comercial, como:",
            items: [
                "Multa contratual (geralmente 10% sobre o valor do aluguel)",
                "Juros de mora: 1% ao mês (com cálculo pró-rata por dia) ou Percentual diário (ex.: 0,10% ao dia)",
                "Carência para cobrança, quando prevista em contrato (ex.: cobrar após 1 dia corrido do vencimento)"
            ]
        },
        proRata: {
            title: "Cálculo pró-rata por dia",
            text: "Se o contrato estabelece juros mensais, a calculadora converte automaticamente para um valor diário proporcional, garantindo um cálculo justo, especialmente em atrasos curtos."
        },
        multipleRents: {
            title: "Suporte a múltiplos aluguéis em atraso",
            intro: "Diferente de calculadoras simples, esta ferramenta permite informar várias parcelas vencidas, cada uma com:",
            items: [
                "Valor do aluguel",
                "Data de vencimento",
                "Data de pagamento (opcional)"
            ],
            explanation: "Isso é essencial quando o atraso envolve 2, 3 ou mais meses, pois cada parcela tem um número diferente de dias em atraso e, portanto, um valor atualizado distinto.",
            resultsIntro: "A calculadora soma tudo automaticamente e apresenta:",
            resultsItems: [
                "Total principal",
                "Total de multa",
                "Total de juros",
                "Total atualizado a pagar ou cobrar"
            ]
        },
        clearResults: {
            title: "Resultados claros e detalhados",
            intro: "Após inserir os dados, você visualiza:",
            items: [
                "O valor atualizado parcela por parcela",
                "O total consolidado da dívida",
                "Quantos dias cada aluguel ficou em atraso",
                "Quanto da dívida corresponde a multa e quanto a juros"
            ],
            facilitatesIntro: "Essas informações facilitam:",
            facilitatesItems: [
                "Negociação amigável",
                "Cobrança administrativa",
                "Conferência de boletos bancários",
                "Organização financeira pessoal ou profissional"
            ]
        },
        examples: {
            title: "Exemplos de uso prático",
            items: [
                "“Atrasei o aluguel em 15 dias, quanto devo pagar?”",
                "“Tenho 3 meses de aluguel vencidos, cada um com valor diferente.”",
                "“O contrato cobra 10% de multa e 1% ao mês. Está certo esse valor?”",
                "“O boleto fala em 0,10% ao dia. Quanto isso dá na prática?”"
            ],
            conclusion: "A calculadora resolve todos esses cenários em segundos."
        },
        disclaimer: {
            title: "Importante: transparência e responsabilidade",
            text: [
                "Esta calculadora utiliza regras contratuais padrão, mas cada contrato pode conter cláusulas específicas.",
                "Os valores calculados são estimativas financeiras, úteis para conferência, negociação e planejamento.",
                "Para disputas judiciais ou cobranças formais, recomenda-se sempre a análise do contrato e, se necessário, a orientação de um profissional jurídico."
            ]
        },
        whyUse: {
            title: "Por que usar a Calculadora de Multa de Atraso do Kitnets.com?",
            items: [
                "✅ Cálculo pró-rata correto",
                "✅ Suporte a múltiplos aluguéis em atraso",
                "✅ Regras flexíveis de multa e juros",
                "✅ Interface simples e rápida",
                "✅ Total transparência nos valores"
            ],
            conclusion: "Se você lida com aluguel atrasado — seja como locatário, locador ou imobiliária — esta é a forma mais prática de saber exatamente quanto é devido, sem surpresas."
        }
    },
    en: {
        title: "Rent Late Payment Fine Calculator",
        intro: "The Kitnets.com Rent Late Payment Fine Calculator allows you to quickly, transparently, and accurately calculate fines and default interest applicable to late rent payments, exactly as provided in the most used tenancy agreements in Brazil.",
        calcContext: "With just a few details, you can find out how much you really need to pay or charge, considering pro-rata per day, different interest rules, and multiple overdue installments at the same time — essential in cases of recurring default.",
        useCases: {
            title: "What is the rent late fine calculator for?",
            items: [
                "Tenants who want to know the correct amount of overdue rent before paying",
                "Landlords who need to calculate fines and interest fairly and documented",
                "Real estate agencies making administrative or extrajudicial collections",
                "Lawyers and property managers needing clear and auditable values"
            ]
        },
        doubts: {
            title: "It eliminates common doubts like:",
            items: [
                "Is the fine applied once or per month?",
                "Is the interest 1% per month or 0.10% per day?",
                "How does the pro-rata calculation work?",
                "What happens when there is more than one overdue rent?"
            ]
        },
        howItWorks: {
            title: "How does the calculation of fines and interest on late rent work?",
            intro: "The calculator follows the most common clauses found in residential and commercial rental contracts, such as:",
            items: [
                "Contractual fine (usually 10% of the rent value)",
                "Default interest: 1% per month (with pro-rata calculation per day) or Daily percentage (e.g., 0.10% per day)",
                "Grace period for collection, when provided in the contract (e.g., charge after 1 calendar day from the due date)"
            ]
        },
        proRata: {
            title: "Pro-rata calculation per day",
            text: "If the contract establishes monthly interest, the calculator automatically converts it to a proportional daily value, ensuring a fair calculation, especially for short delays."
        },
        multipleRents: {
            title: "Support for multiple overdue rents",
            intro: "Unlike simple calculators, this tool allows you to enter multiple overdue installments, each with:",
            items: [
                "Rent amount",
                "Due date",
                "Payment date (optional)"
            ],
            explanation: "This is essential when the delay involves 2, 3, or more months, as each installment has a different number of days in arrears and, therefore, a distinct updated value.",
            resultsIntro: "The calculator automatically sums everything up and presents:",
            resultsItems: [
                "Total principal",
                "Total fine",
                "Total interest",
                "Total updated amount to pay or charge"
            ]
        },
        clearResults: {
            title: "Clear and detailed results",
            intro: "After entering the data, you view:",
            items: [
                "The updated value installment by installment",
                "The consolidated total of the debt",
                "How many days each rent was late",
                "How much of the debt corresponds to fines and how much to interest"
            ],
            facilitatesIntro: "This information facilitates:",
            facilitatesItems: [
                "Friendly negotiation",
                "Administrative collection",
                "Checking bank slips",
                "Personal or professional financial organization"
            ]
        },
        examples: {
            title: "Practical usage examples",
            items: [
                "“I delayed the rent by 15 days, how much should I pay?”",
                "“I have 3 months of overdue rent, each with a different value.”",
                "“The contract charges 10% fine and 1% per month. Is this value correct?”",
                "“The slip says 0.10% per day. How much is that in practice?”"
            ],
            conclusion: "The calculator resolves all these scenarios in seconds."
        },
        disclaimer: {
            title: "Important: transparency and responsibility",
            text: [
                "This calculator uses standard contractual rules, but each contract may contain specific clauses.",
                "The calculated values are financial estimates, useful for checking, negotiation, and planning.",
                "For legal disputes or formal collections, it is always recommended to analyze the contract and, if necessary, seek guidance from a legal professional."
            ]
        },
        whyUse: {
            title: "Why use the Kitnets.com Late Fine Calculator?",
            items: [
                "✅ Correct pro-rata calculation",
                "✅ Support for multiple overdue rents",
                "✅ Flexible fine and interest rules",
                "✅ Simple and fast interface",
                "✅ Total transparency in values"
            ],
            conclusion: "If you deal with late rent — whether as a tenant, landlord, or real estate agency — this is the most practical way to know exactly what is due, without surprises."
        }
    },
    es: {
        title: "Calculadora de Multa de Atraso en el Alquiler",
        intro: "La Calculadora de Multa de Atraso en el Pago de Alquiler de Kitnets.com permite calcular de forma rápida, transparente y precisa multas e intereses de mora aplicables a alquileres pagados con retraso, exactamente como se prevé en los contratos de arrendamiento más utilizados en Brasil.",
        calcContext: "Con pocos datos, descubres cuánto realmente debes pagar o cobrar, considerando pro-rata por día, diferentes reglas de intereses y varias cuotas en atraso al mismo tiempo — algo esencial en casos de incumplimiento recurrente.",
        useCases: {
            title: "¿Para qué sirve la calculadora de multa por atraso en el alquiler?",
            items: [
                "Inquilinos que quieren saber el valor correcto del alquiler atrasado antes de pagar",
                "Propietarios que necesitan calcular multas e intereses de forma justa y documentada",
                "Inmobiliarias que realizan cobros administrativos o extrajudiciales",
                "Abogados y administradores de inmuebles que necesitan valores claros y auditables"
            ]
        },
        doubts: {
            title: "Elimina dudas comunes como:",
            items: [
                "¿La multa se aplica una sola vez o por mes?",
                "¿El interés es del 1% al mes o 0,10% al día?",
                "¿Cómo funciona el cálculo pro-rata?",
                "¿Qué sucede cuando hay más de un alquiler vencido?"
            ]
        },
        howItWorks: {
            title: "¿Cómo funciona el cálculo de la multa y los intereses del alquiler atrasado?",
            intro: "La calculadora sigue las cláusulas más comunes encontradas en contratos de arrendamiento residencial y comercial, como:",
            items: [
                "Multa contractual (generalmente 10% sobre el valor del alquiler)",
                "Intereses de mora: 1% al mes (con cálculo pro-rata por día) o Porcentaje diario (ej.: 0,10% al día)",
                "Carencia para cobro, cuando se prevé en contrato (ej.: cobrar después de 1 día corrido del vencimiento)"
            ]
        },
        proRata: {
            title: "Cálculo pro-rata por día",
            text: "Si el contrato establece intereses mensuales, la calculadora convierte automáticamente a un valor diario proporcional, garantizando un cálculo justo, especialmente en atrasos cortos."
        },
        multipleRents: {
            title: "Soporte a múltiples alquileres en atraso",
            intro: "A diferencia de calculadoras simples, esta herramienta permite informar varias cuotas vencidas, cada una con:",
            items: [
                "Valor del alquiler",
                "Fecha de vencimiento",
                "Fecha de pago (opcional)"
            ],
            explanation: "Esto es esencial cuando el atraso involucra 2, 3 o más meses, ya que cada cuota tiene un número diferente de días de atraso y, por lo tanto, un valor actualizado distinto.",
            resultsIntro: "La calculadora suma todo automáticamente y presenta:",
            resultsItems: [
                "Total principal",
                "Total de multa",
                "Total de intereses",
                "Total actualizado a pagar o cobrar"
            ]
        },
        clearResults: {
            title: "Resultados claros y detallados",
            intro: "Después de ingresar los datos, visualizas:",
            items: [
                "El valor actualizado cuota por cuota",
                "El total consolidado de la deuda",
                "Cuántos días cada alquiler estuvo en atraso",
                "Cuánto de la deuda corresponde a multa y cuánto a intereses"
            ],
            facilitatesIntro: "Estas informaciones facilitan:",
            facilitatesItems: [
                "Negociación amigable",
                "Cobro administrativo",
                "Conferencia de boletos bancarios",
                "Organización financiera personal o profesional"
            ]
        },
        examples: {
            title: "Ejemplos de uso práctico",
            items: [
                "“Atrasé el alquiler 15 días, ¿cuánto debo pagar?”",
                "“Tengo 3 meses de alquiler vencidos, cada uno con valor diferente.”",
                "“El contrato cobra 10% de multa e 1% al mes. ¿Está bien este valor?”",
                "“El boleto dice 0,10% al día. ¿Cuánto es eso en la práctica?”"
            ],
            conclusion: "La calculadora resuelve todos estos escenarios en segundos."
        },
        disclaimer: {
            title: "Importante: transparencia y responsabilidad",
            text: [
                "Esta calculadora utiliza reglas contractuales estándar, pero cada contrato puede contener cláusulas específicas.",
                "Los valores calculados son estimaciones financieras, útiles para conferencia, negociación y planificación.",
                "Para disputas judiciales o cobros formales, se recomienda siempre el análisis del contrato y, si es necesario, la orientación de un profesional jurídico."
            ]
        },
        whyUse: {
            title: "¿Por qué usar la Calculadora de Multa de Atraso de Kitnets.com?",
            items: [
                "✅ Cálculo pro-rata correcto",
                "✅ Soporte a múltiples alquileres en atraso",
                "✅ Reglas flexibles de multa e intereses",
                "✅ Interfaz simple y rápida",
                "✅ Total transparencia en los valores"
            ],
            conclusion: "Si lidias con alquiler atrasado — ya sea como inquilino, propietario o inmobiliaria — esta es la forma más práctica de saber exactamente cuánto se debe, sin sorpresas."
        }
    }
};

export default function RentLateFineContent({ lang }: { lang: Language }) {
    const content = contentData[lang] || contentData['pt'];

    return (
        <div className="mt-12 space-y-12 max-w-4xl mx-auto text-muted-foreground animate-in fade-in duration-500">

            <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">{content.title}</h2>
                <div className="space-y-4 leading-relaxed">
                    <p>{content.intro}</p>
                    <p>{content.calcContext}</p>
                </div>
            </section>

            <section className="grid md:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">{content.useCases.title}</h3>
                    <ul className="list-disc pl-5 space-y-2">
                        {content.useCases.items.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">{content.doubts.title}</h3>
                    <ul className="list-disc pl-5 space-y-2">
                        {content.doubts.items.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-foreground mb-4">{content.howItWorks.title}</h3>
                <p className="mb-4">{content.howItWorks.intro}</p>
                <ul className="list-disc pl-5 space-y-2 mb-6">
                    {content.howItWorks.items.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>

                <div className="bg-muted/50 p-6 rounded-lg mb-6 border border-border">
                    <h4 className="font-bold text-foreground mb-2">{content.proRata.title}</h4>
                    <p>{content.proRata.text}</p>
                </div>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-foreground mb-4">{content.multipleRents.title}</h3>
                <p className="mb-4">{content.multipleRents.intro}</p>
                <ul className="list-disc pl-5 space-y-2 mb-4">
                    {content.multipleRents.items.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
                <p className="mb-4">{content.multipleRents.explanation}</p>
                <p className="mb-4 font-medium text-foreground">{content.multipleRents.resultsIntro}</p>
                <ul className="list-none grid sm:grid-cols-2 gap-2">
                    {content.multipleRents.resultsItems.map((item, index) => (
                        <li key={index} className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary rounded-full"></span>
                            {item}
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-foreground mb-4">{content.clearResults.title}</h3>
                <p className="mb-4">{content.clearResults.intro}</p>
                <ul className="list-disc pl-5 space-y-2 mb-6">
                    {content.clearResults.items.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
                <p className="mb-4 font-medium text-foreground">{content.clearResults.facilitatesIntro}</p>
                <ul className="list-disc pl-5 space-y-2">
                    {content.clearResults.facilitatesItems.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
            </section>

            <section className="bg-blue-50 dark:bg-blue-950/40 p-8 rounded-xl border border-blue-100 dark:border-blue-900">
                <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-6">{content.examples.title}</h3>
                <div className="space-y-3 mb-6">
                    {content.examples.items.map((item, index) => (
                        <p key={index} className="italic text-blue-800 dark:text-blue-200">&quot;{item.replace(/“|”/g, '')}&quot;</p>
                    ))}
                </div>
                <p className="font-medium text-blue-900 dark:text-blue-100">{content.examples.conclusion}</p>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-foreground mb-4">{content.whyUse.title}</h3>
                <ul className="space-y-3 mb-6">
                    {content.whyUse.items.map((item, index) => (
                        <li key={index} className="font-medium text-foreground">{item}</li>
                    ))}
                </ul>
                <p className="text-lg font-medium text-foreground">{content.whyUse.conclusion}</p>
            </section>

            <section className="border-t border-border pt-8 mt-12">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">{content.disclaimer.title}</h3>
                <div className="text-sm space-y-2 text-muted-foreground">
                    {content.disclaimer.text.map((text, index) => (
                        <p key={index}>{text}</p>
                    ))}
                </div>
            </section>

        </div>
    );
}
