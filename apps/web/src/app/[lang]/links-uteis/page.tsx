import {
    Landmark,
    ShieldCheck,
    Scale,
    TrendingUp,
    Link as LinkIcon,
    ExternalLink,
    AlertCircle
} from "lucide-react";
import Link from "next/link";
import { Metadata } from "next";
import { SuggestLinkForm } from "./components/SuggestLinkForm";

export const metadata: Metadata = {
    title: "Links Úteis | Kitnets.com",
    description: "Links oficiais e confiáveis para financiamento imobiliário, seguros e legislação.",
};

export default function UsefulLinksPage() {
    return (
        <div className="flex flex-col items-center">
            {/* Header */}
            <header className="w-full max-w-4xl px-4 py-12 md:py-16 space-y-6 text-center sm:text-left">
                <div className="flex items-center gap-3 justify-center sm:justify-start text-primary mb-4">
                    <LinkIcon className="h-8 w-8" />
                    <span className="text-sm font-semibold uppercase tracking-wider">Recursos</span>
                </div>

                <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
                    Links Úteis
                </h1>
                <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl">
                    Financiamento, Seguros e Legislação Imobiliária
                </p>

                <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground leading-relaxed bg-muted/30 p-6 rounded-2xl border border-border">
                    <p>
                        Nesta página reunimos links oficiais e confiáveis para ajudar proprietários, inquilinos, corretores e investidores a tomar decisões informadas sobre financiamento imobiliário, seguros, contratos de locação e legislação brasileira.
                    </p>
                    <p className="font-medium text-amber-600 dark:text-amber-500 mt-4 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Recomendamos sempre consultar diretamente as fontes oficiais antes de contratar qualquer produto ou serviço.
                    </p>
                </div>
            </header>

            {/* Content Sections */}
            <div className="w-full max-w-4xl px-4 pb-20 space-y-16">

                {/* Bancos */}
                <section className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <Landmark className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Bancos Brasileiros — Financiamento Imobiliário</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            { name: "Caixa Econômica Federal", url: "https://www.caixa.gov.br/voce/habitacao", desc: "Principal banco do país para financiamento habitacional e programas como o Minha Casa Minha Vida." },
                            { name: "Banco do Brasil", url: "https://www.bb.com.br/site/pra-voce/financiamentos/financiamento-imobiliario/", desc: "Financiamento para imóveis novos, usados e construção." },
                            { name: "Itaú Unibanco", url: "https://www.itau.com.br/emprestimos-financiamentos/credito-imobiliario", desc: "Simulação online, taxa fixa ou indexada." },
                            { name: "Bradesco", url: "https://banco.bradesco/html/exclusive/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-aquisicao-de-imoveis.shtm", desc: "Financiamento para compra e construção." },
                            { name: "Santander Brasil", url: "https://www.santander.com.br/banco/credito-financiamento-imobiliario?utm_urlsuffix=M19726-32897-4&gclsrc=aw.ds&gad_source=1&gad_campaignid=16267363643&gbraid=0AAAAAoYBGN299kZNjDdqtcVwRf_4C9z6K&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQHx-VdQql2JvHsVHlUUacSHKeniw-zcdydpkBSS4TEKyCCewrT0fjRoCUbQQAvD_BwE", desc: "Crédito imobiliário com diversas modalidades." },
                            { name: "Inter", url: "https://inter.co/pra-voce/financiamento-imobiliario/residencial/?utm_source=google&utm_medium=cpc&utm_campaign=pesquisa+-+financiamento+imobiliario+-+always+on&utm_term=financiamento-imobiliario&utm_content=alwayson&gad_source=1&gad_campaignid=20124926130&gbraid=0AAAAADyYGsc7SGJCamLn4MzcaQCshDpui&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQCsnXG9zayT6lnYmWVuPcaRlQ5-eHFPG8HiMsF8DMJUw6Gbh-V1T7hoCXEYQAvD_BwE", desc: "Processo digital e integração com conta digital." },
                            { name: "Sicredi", url: "https://www.sicredi.com.br/site/credito/para-voce/credito-imobiliario/", desc: "Cooperativa de crédito com forte atuação regional." },
                            { name: "Sicoob", url: "https://www.sicoob.com.br/web/creditoimobiliario/simulador", desc: "Opções para associados de cooperativas." },
                        ].map((bank, i) => (
                            <Link
                                key={i}
                                href={bank.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group p-5 rounded-xl border border-border bg-card hover:bg-accent/50 hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{bank.name}</h3>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">{bank.desc}</p>
                                </div>
                                <div className="mt-4 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                    Visitar site oficial →
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Seguros */}
                <section className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-200">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Seguros Imobiliários e Residenciais</h2>
                    </div>

                    <p className="text-muted-foreground">
                        Seguros são parte essencial de contratos de financiamento e locação. Veja as principais seguradoras do Brasil:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                            { name: "Porto Seguro", url: "https://www.portoseguro.com.br/seguro-residencial" },
                            { name: "Tokio Marine", url: "https://www.tokiomarine.com.br/seguros-residenciais/seguro-residencial/?utm_source=google&utm_medium=cpc&utm_campaign=crho-tkm-gg-institucional_marca-search-perfor-trafg-aon&utm_content=interesse-keyword-rd&gad_source=1&gad_campaignid=18352223194&gbraid=0AAAAADnO_8thMZd9HpKKK6PDmQu07FcyN&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQBEQWNFsGVnx7S6E4a58I0dcRT9BLD4L1i_XhcMFY5KwRFcNFJ5whhoC0k0QAvD_BwE" },
                            { name: "Mapfre", url: "https://seguros.mapfre.com.br/imovel/?utm_source=google&utm_medium=cpc&utm_campaign=mapfre_br_home_sem-bra_google_pro_on-going_performance_202405&dcuserid=%25m&utm_campaign=11727147806&utm_medium=cpc&utm_source=google&kwmatch=b&wkwd=mapfre%20seguro%20residencial&product=&gclsrc=aw.ds&gad_source=1&gad_campaignid=11727147806&gbraid=0AAAAADuzuoRIEAYBc9fusz2yri6yOnnNV&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQMXm8I8VHo0GQjUqRBQOPgz3USbp4kteZIhdHKutBZmKLLH-8vBXnxoCjwwQAvD_BwE" },
                            { name: "Bradesco Seguros", url: "https://loja.bradescoseguros.com.br/page/public/pt/BR/process/enter/HOMEVitrineProcess?productId=HOMEVitrine&activeZone=MyZone&utm_source=GOOGLE-ADS&utm_medium=SEARCH&utm_content=alp_brse_aon_gad_cov_lds_residencial-marca_nu_nu_kew_Nacional_a18-99_bsa02283al_V142447&utm_campaign=alp_brse_search_cpc_aon_residencial-marca_cov_brr_gad_auction_lds_perf_V142447&gad_source=1&gad_campaignid=23096529498&gbraid=0AAAAADjt0wKjBEeboxIWVMoiK5RiLLJp-&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQN7DdvgOMT8ieXAslA7UYrMUFeQx0F6PL_uyN0-Q0rNq3YfWITGIRhoCE4IQAvD_BwE" },
                            { name: "Zurich Seguros", url: "https://www.zurich.com.br/seguros-para-voce/imoveis/residencia?utm_source=google&utm_medium=cpc&utm_campaign=%28O%29_MEIO_GADS_AON_RESIDENCIA_2025&utm_term=%28O%29_KEYWORD_RESIDENCIA&gad_source=1&gad_campaignid=21794507660&gbraid=0AAAAAoeUOXi5VCafxCfUhR_xXJZ7MW2ae&gclid=CjwKCAiA3rPKBhBZEiwAhPNFQGRT-YIy0ILv2x3kNS-Uv_Vqbc_owgZg-wnJkF03EuEpk3b2AfOOjhoCPg0QAvD_BwE" },
                            { name: "Caixa Seguradora", url: "https://www.caixaseguradora.com.br/" },
                        ].map((seg, i) => (
                            <Link
                                key={i}
                                href={seg.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-blue-200 dark:hover:border-blue-900 transition-all group"
                            >
                                <span className="font-semibold text-foreground">{seg.name}</span>
                                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                            </Link>
                        ))}
                    </div>
                    <div className="bg-muted/30 p-4 rounded-lg border border-border text-sm text-muted-foreground">
                        Esses seguros podem cobrir incêndio, danos elétricos, responsabilidade civil, entre outros — muitos exigidos em contratos de financiamento e locação.
                    </div>
                </section>

                {/* Legislação */}
                <section className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-300">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                            <Scale className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Legislação Imobiliária e Locação</h2>
                    </div>

                    <p className="text-muted-foreground">
                        Conhecer a legislação é fundamental para evitar conflitos e garantir segurança jurídica.
                    </p>

                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { name: "Lei do Inquilinato (Lei nº 8.245/1991)", url: "http://www.planalto.gov.br/ccivil_03/leis/l8245.htm", desc: "Regula direitos e deveres de locadores e inquilinos no Brasil." },
                            { name: "Código Civil Brasileiro (Lei nº 10.406/2002)", url: "http://www.planalto.gov.br/ccivil_03/leis/2002/l10406.htm", desc: "Base legal para contratos, propriedade e obrigações." },
                        ].map((law, i) => (
                            <Link
                                key={i}
                                href={law.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-5 rounded-xl border border-border bg-card hover:bg-accent transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                            >
                                <div>
                                    <h3 className="font-bold text-foreground flex items-center gap-2">
                                        {law.name}
                                        <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">{law.desc}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Índices */}
                <section className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-400">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                            <TrendingUp className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Índices Econômicos e Referências Importantes</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {[
                            { name: "IPCA – Inflação Oficial (IBGE)", url: "https://www.ibge.gov.br/indicadores#ipca", desc: "" },
                            { name: "IGP-M (FGV)", url: "https://portal.fgv.br/especiais/igp-m-resultados", desc: "" },
                            { name: "FipeZap – Índice de Preços de Imóveis", url: "https://www.fipe.org.br/pt-br/indices/fipezap/", desc: "" },
                            { name: "Banco Central do Brasil", url: "https://www.bcb.gov.br", desc: "Taxa Selic, crédito, sistema financeiro e regulamentações." },
                        ].map((idx, i) => (
                            <Link
                                key={i}
                                href={idx.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-5 rounded-xl border border-border bg-card hover:bg-accent hover:border-purple-300 dark:hover:border-purple-800 transition-all flex flex-col justify-between"
                            >
                                <div>
                                    <h3 className="font-bold text-foreground mb-2 flex items-center justify-between">
                                        {idx.name}
                                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                    </h3>
                                    {idx.desc && (
                                        <p className="text-sm text-muted-foreground">
                                            {idx.desc}
                                        </p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Suggest Link Form */}
                <div className="max-w-2xl mx-auto w-full">
                    <SuggestLinkForm />
                </div>

                {/* Disclaimer */}
                <div className="mt-16 p-6 rounded-2xl bg-muted border border-border text-center space-y-2">
                    <h3 className="font-bold text-foreground">Observação Importante</h3>
                    <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                        O Kitnets.com não representa instituições financeiras, seguradoras ou órgãos públicos.
                        Os links acima são fornecidos apenas para fins informativos. Sempre confirme condições, taxas e cláusulas diretamente com as instituições oficiais ou com um profissional especializado (advogado, corretor ou contador).
                    </p>
                </div>

            </div>
        </div>
    );
}
