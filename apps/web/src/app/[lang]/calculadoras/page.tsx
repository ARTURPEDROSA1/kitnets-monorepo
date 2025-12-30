import { getDictionary } from '@/dictionaries';
import { CalculatorsOverview } from '@/components/calculators/CalculatorsOverview';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const dict = getDictionary(params.lang);
    return {
        title: dict.calculatorsOverview.title,
        description: dict.calculatorsOverview.subtitle,
    };
}

export default function CalculatorOverviewPage({ params: { lang } }: { params: { lang: string } }) {
    const dict = getDictionary(lang);
    return <CalculatorsOverview lang={lang} dict={dict} />;
}
