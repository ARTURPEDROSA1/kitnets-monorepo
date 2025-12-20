export type FaqCategory =
    | "Geral"
    | "Moradores"
    | "Proprietários"
    | "Imobiliárias"
    | "Construtoras"
    | "Conta & Segurança"
    | "Anúncios & Pagamentos"
    | "Tecnologia & Dados";

export interface FaqItem {
    question: string;
    answer: string;
    category: FaqCategory;
}

export const faqData: FaqItem[] = [
    // Geral
    {
        category: "Geral",
        question: "O que é a Kitnets.com?",
        answer: "A Kitnets.com é uma plataforma digital especializada em imóveis compactos — como kitnets, studios e apartamentos pequenos — que conecta moradores, proprietários, imobiliárias e construtoras em um único ecossistema inteligente, orientado por dados e tecnologia.",
    },
    {
        category: "Geral",
        question: "A Kitnets.com é um portal imobiliário tradicional?",
        answer: "Não. A Kitnets.com vai além de anúncios. É uma plataforma SaaS com marketplace, dashboards, relatórios, indicadores de mercado, automação e recursos baseados em dados para tomada de decisão.",
    },
    {
        category: "Geral",
        question: "A plataforma atua em quais cidades?",
        answer: "Inicialmente no Brasil, com expansão progressiva por cidade e região conforme novos anúncios, usuários e dados de mercado são adicionados.",
    },
    // Moradores
    {
        category: "Moradores",
        question: "Preciso pagar para usar a Kitnets.com?",
        answer: "Não. Buscar imóveis, criar alertas e acompanhar oportunidades é gratuito para moradores.",
    },
    {
        category: "Moradores",
        question: "Posso criar alertas personalizados de imóveis?",
        answer: "Sim. Você pode criar alertas por cidade, bairro, faixa de preço, tipo de imóvel e receber notificações quando um imóvel compatível for anunciado.",
    },
    {
        category: "Moradores",
        question: "Posso usar a plataforma mesmo sem estar procurando agora?",
        answer: "Sim. Muitos usuários usam a Kitnets.com para acompanhar o mercado, entender preços médios e se planejar para uma mudança futura.",
    },
    {
        category: "Moradores",
        question: "Consigo solicitar manutenção pelo site?",
        answer: "Sim, se o proprietário ou a imobiliária utilizarem a Kitnets.com. Todas as solicitações ficam registradas e organizadas em um único lugar.",
    },
    {
        category: "Moradores",
        question: "Meus dados pessoais ficam protegidos?",
        answer: "Sim. A Kitnets.com segue a LGPD (Lei Geral de Proteção de Dados) e adota boas práticas de segurança e privacidade.",
    },
    // Proprietários
    {
        category: "Proprietários",
        question: "Sou proprietário, posso anunciar diretamente?",
        answer: "Sim. Proprietários podem anunciar diretamente, sem necessidade de intermediários, ou operar em conjunto com uma imobiliária.",
    },
    {
        category: "Proprietários",
        question: "A plataforma ajuda na gestão dos imóveis?",
        answer: "Sim. Você terá acesso a um painel com contratos, vencimentos, reajustes, histórico, indicadores e relatórios — sem planilhas.",
    },
    {
        category: "Proprietários",
        question: "Consigo analisar se vale a pena investir em um novo imóvel?",
        answer: "Sim. A Kitnets.com oferece dados de mercado, métricas de rentabilidade, vacância, preços médios e tendências locais.",
    },
    {
        category: "Proprietários",
        question: "Posso gerenciar vários imóveis?",
        answer: "Sim. A plataforma foi projetada para pequenos, médios e grandes proprietários.",
    },
    {
        category: "Proprietários",
        question: "A Kitnets.com substitui uma imobiliária?",
        answer: "Ela pode complementar ou substituir, dependendo do seu modelo. Proprietários autônomos encontram todas as ferramentas necessárias para gestão própria.",
    },
    // Imobiliárias
    {
        category: "Imobiliárias",
        question: "Por que uma imobiliária deveria usar a Kitnets.com?",
        answer: "Para centralizar anúncios, leads, contratos, manutenção, relatórios e inteligência de mercado em uma única plataforma moderna.",
    },
    {
        category: "Imobiliárias",
        question: "A Kitnets.com concorre com imobiliárias?",
        answer: "Não. A plataforma foi criada para ser uma parceira tecnológica das imobiliárias, ampliando alcance, eficiência e geração de leads.",
    },
    {
        category: "Imobiliárias",
        question: "Posso usar a Kitnets.com junto com meu sistema atual?",
        answer: "Sim. A plataforma pode coexistir com sistemas internos, focando em dados, marketplace e experiência do usuário.",
    },
    {
        category: "Imobiliárias",
        question: "Recebo leads qualificados?",
        answer: "Sim. Os usuários que chegam pela Kitnets.com têm perfil específico para imóveis compactos, o que aumenta a taxa de conversão.",
    },
    // Construtoras
    {
        category: "Construtoras",
        question: "Construtoras podem anunciar lançamentos?",
        answer: "Sim. Construtoras podem divulgar lançamentos, fases de obra, unidades disponíveis e captar investidores e compradores qualificados.",
    },
    {
        category: "Construtoras",
        question: "A plataforma ajuda a decidir onde investir?",
        answer: "Sim. A Kitnets.com fornece dados agregados sobre demanda, preços, liquidez e perfil de moradores por região.",
    },
    {
        category: "Construtoras",
        question: "Posso divulgar apenas para investidores?",
        answer: "Sim. É possível direcionar comunicações e anúncios para investidores interessados em renda com aluguel.",
    },
    // Conta & Segurança (Text says "Conta, Cadastro e Segurança" mapping to "Conta & Segurança" category)
    {
        category: "Conta & Segurança",
        question: "Preciso criar uma conta para usar a plataforma?",
        answer: "Algumas funcionalidades são abertas. Para criar alertas, anunciar ou acessar dashboards, é necessário cadastro.",
    },
    {
        category: "Conta & Segurança",
        question: "Como funciona o login?",
        answer: "A Kitnets.com utiliza login seguro por e-mail com link de acesso (magic link), sem necessidade de senha.",
    },
    {
        category: "Conta & Segurança",
        question: "Já tenho cadastro, mas esqueci como entrar. O que faço?",
        answer: "Basta informar seu e-mail novamente. Se já estiver cadastrado, você receberá um link de acesso.",
    },
    // Anúncios & Pagamentos (Text says "Anúncios e Publicação" mapping to "Anúncios & Pagamentos")
    {
        category: "Anúncios & Pagamentos",
        question: "Quanto custa anunciar um imóvel?",
        answer: "A política de preços pode variar conforme o perfil (proprietário, imobiliária ou construtora). Alguns planos iniciais podem ser gratuitos ou promocionais.",
    },
    {
        category: "Anúncios & Pagamentos",
        question: "Quanto tempo leva para um anúncio ficar ativo?",
        answer: "Após o preenchimento completo e validação, o anúncio pode ficar ativo rapidamente.",
    },
    {
        category: "Anúncios & Pagamentos",
        question: "Posso editar ou pausar meu anúncio?",
        answer: "Sim. Todos os anúncios podem ser editados, pausados ou removidos a qualquer momento pelo painel.",
    },
    // Tecnologia & Dados (Text also has "Suporte e Contato" and "Legal e Conformidade", I'll map them or add categories)
    {
        category: "Tecnologia & Dados",
        question: "A Kitnets.com usa inteligência artificial?",
        answer: "Sim. A plataforma utiliza IA e análise de dados para melhorar buscas, recomendações, insights de mercado e relatórios.",
    },
    {
        category: "Tecnologia & Dados",
        question: "Os dados de mercado são confiáveis?",
        answer: "Sim. Os dados são agregados, analisados e atualizados continuamente com base na atividade real da plataforma e fontes públicas.",
    },
    // I will add the extra ones to their appropriate categories or create new ones if needed.
    // The spec listed: Geral, Moradores, Proprietários, Imobiliárias, Construtoras, Conta & Segurança, Anúncios & Pagamentos, Tecnologia & Dados
    // "Suporte e Contato" -> Geral? Or maybe "Conta & Segurança"? or create new.
    // The spec list "Suggested categories" was finite. I will stick to it.
    // I will put Suporte under "Geral" or "Conta & Segurança". "Como entro em contato" -> Geral feels right.
    {
        category: "Geral",
        question: "Como entro em contato com a Kitnets.com?",
        answer: "Você pode utilizar o formulário de contato no site ou enviar um e-mail para o canal oficial informado na plataforma.",
    },
    {
        category: "Geral",
        question: "Existe atendimento humano?",
        answer: "Sim. Além de automação, a Kitnets.com oferece suporte humano conforme o plano e a necessidade.",
    },
    // Legal e Conformidade -> Conta & Segurança
    {
        category: "Conta & Segurança",
        question: "A Kitnets.com segue a LGPD?",
        answer: "Sim. A plataforma está em conformidade com a Lei Geral de Proteção de Dados.",
    },
    {
        category: "Conta & Segurança",
        question: "A Kitnets.com intermedeia contratos ou pagamentos?",
        answer: "A plataforma pode facilitar processos, mas os termos finais de contrato e pagamento dependem das partes envolvidas.",
    }
];

export const categories: FaqCategory[] = [
    "Geral",
    "Moradores",
    "Proprietários",
    "Imobiliárias",
    "Construtoras",
    "Conta & Segurança",
    "Anúncios & Pagamentos",
    "Tecnologia & Dados"
];
