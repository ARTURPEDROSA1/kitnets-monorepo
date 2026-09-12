-- Database: seed_abono_salarial_2026.sql

DO $$
DECLARE
    v_author_id uuid;
    v_category_id uuid;
    v_article_id uuid;
BEGIN
    -- 1. Ensure Category 'Salário e Renda'
    INSERT INTO categories (name, slug, description)
    VALUES ('Salário e Renda', 'salario-e-renda', 'Informações sobre salário mínimo, abono salarial, benefícios e renda fixa.')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

    SELECT id INTO v_category_id FROM categories WHERE slug = 'salario-e-renda';

    -- 2. Ensure Author 'Equipe Kitnets'
    INSERT INTO authors (name, slug, bio, avatar_url)
    VALUES ('Equipe Kitnets', 'equipe-kitnets', 'Especialistas em mercado imobiliário, economia e legislação brasileira.', '/images/kitnets-logo.png')
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO v_author_id FROM authors WHERE slug = 'equipe-kitnets';

    -- 3. Ensure Tags
    INSERT INTO tags (name, slug) VALUES 
        ('Abono Salarial', 'abono-salarial'),
        ('PIS', 'pis'),
        ('PASEP', 'pasep'),
        ('Benefícios', 'beneficios')
    ON CONFLICT (slug) DO NOTHING;

    -- 4. Check/Insert Article
    -- We identify the article by the translation slug 'abono-salarial-2026' because articles don't have slugs themselves.
    -- Ideally, we check article_translations first.
    
    SELECT article_id INTO v_article_id 
    FROM article_translations 
    WHERE lang = 'pt' AND slug = 'abono-salarial-2026';

    IF v_article_id IS NULL THEN
        INSERT INTO articles (author_id, primary_category_id, status, published_at)
        VALUES (v_author_id, v_category_id, 'published', NOW())
        RETURNING id INTO v_article_id;
    ELSE
        -- Update article timestamps/status if needed (optional)
        UPDATE articles SET status = 'published', published_at = NOW() WHERE id = v_article_id;
    END IF;

    -- 5. Upsert Translation
    INSERT INTO article_translations (article_id, lang, title, slug, excerpt, content_mdx, metadata, reading_time_minutes)
    VALUES (
        v_article_id,
        'pt',
        'Abono Salarial 2026 (PIS/PASEP): Quem Tem Direito, Calendário Oficial, Valores e Como Consultar',
        'abono-salarial-2026',
        'O Abono Salarial 2026 já tem calendário oficial aprovado e começa a ser pago a partir de 15 de fevereiro de 2026. Saiba quem tem direito, valores e como sacar.',
        $MDX$
O Abono Salarial 2026 já tem calendário oficial aprovado e começa a ser pago a partir de 15 de fevereiro de 2026. O benefício é destinado a trabalhadores que exerceram atividade formal em 2024 e pode chegar ao valor de um salário mínimo integral, conforme o tempo de trabalho no ano-base.

<Callout type="warning">
  <p className="font-bold">⚠️ Atenção (ponto-chave):</p>
  <p>Ano-base do Abono Salarial 2026 = 2024</p>
  <p>O pagamento ocorre em 2026, mas considera os meses trabalhados em 2024.</p>
</Callout>

## ✅ O que é o Abono Salarial?

O Abono Salarial é um benefício anual garantido pela Constituição Federal, pago a trabalhadores formais de baixa renda como complemento de renda. Ele se divide em:

*   **PIS** – trabalhadores do setor privado
*   **PASEP** – servidores públicos e empregados de estatais

## 👤 Quem tem direito ao Abono Salarial 2026?

Para receber o Abono em 2026, o trabalhador precisa cumprir todos os requisitos abaixo, considerando o ano-base 2024:

*   Estar inscrito no PIS/PASEP há pelo menos 5 anos
*   Ter trabalhado mínimo de 30 dias com carteira assinada em 2024 (consecutivos ou não)
*   Ter recebido até dois salários mínimos de média mensal em 2024
*   Ter os dados corretamente informados pelo empregador no eSocial/RAIS

> 📌 **Observação importante:** trabalhar 15 dias ou mais em um mês já conta como mês cheio para o cálculo.

## 📅 Calendário oficial do Abono Salarial 2026

O pagamento segue o mês de nascimento do trabalhador, sempre no dia 15 (ou no próximo dia útil).

| Nascimento | Data de pagamento |
| :--- | :--- |
| Janeiro | 15/02/2026 |
| Fevereiro | 15/03/2026 |
| Março e Abril | 15/04/2026 |
| Maio e Junho | 15/05/2026 |
| Julho e Agosto | 15/06/2026 |
| Setembro e Outubro | 15/07/2026 |
| Novembro e Dezembro | 15/08/2026 |

**⏳ Prazo final para saque: até 30 de dezembro de 2026.**

## 💰 Qual é o valor do Abono Salarial 2026?

O valor do Abono é proporcional aos meses trabalhados em 2024.
Cada mês equivale a 1/12 do salário mínimo vigente em 2026, que é R$ 1.621,00.

### 📊 Tabela completa do Abono Salarial 2026 (ano-base 2024)

| Nº de meses trabalhados em 2024 | Valor a receber |
| :--- | :--- |
| 1 mês | R$ 135,08 |
| 2 meses | R$ 270,16 |
| 3 meses | R$ 405,24 |
| 4 meses | R$ 540,33 |
| 5 meses | R$ 675,40 |
| 6 meses | R$ 810,48 |
| 7 meses | R$ 945,56 |
| 8 meses | R$ 1.080,64 |
| 9 meses | R$ 1.215,72 |
| 10 meses | R$ 1.350,80 |
| 11 meses | R$ 1.485,88 |
| 12 meses | R$ 1.621,00 |

<Callout type="info">
  <p className="font-bold">🔎 Exemplo prático:</p>
  <p>Quem trabalhou 8 meses em 2024 e atende aos critérios receberá R$ 1.080,64 de Abono Salarial em 2026.</p>
</Callout>

## 🔎 Como consultar se você tem direito

A consulta fica disponível a partir de 5 de fevereiro de 2026 pelos canais oficiais:

*   Aplicativo Carteira de Trabalho Digital
*   Portal Emprega Brasil (gov.br)
*   Telefone 158 – Ministério do Trabalho e Emprego

Na consulta, você verifica:

*   Se tem direito ao benefício
*   O valor exato a receber
*   A data de pagamento
*   O banco responsável pelo crédito

## 🏦 Como sacar o Abono Salarial

### Setor privado (PIS):
*   Crédito automático em conta
*   Poupança social digital (Caixa Tem)
*   Saque em lotéricas, terminais ou agências

### Servidores públicos (PASEP):
*   Crédito em conta
*   Transferência via PIX/TED
*   Saque presencial, se não houver conta

### ❓ E se eu não sacar?

Os valores ficam disponíveis até 30 de dezembro de 2026. Após esse prazo, a recuperação é possível apenas por procedimento administrativo, mais demorado.
**👉 Recomendação: consulte e saque dentro do calendário.**

## 🧠 Por que entender o ano-base é essencial?

Muitos trabalhadores perdem o benefício por confundir:
*   ❌ ano do pagamento
*   ❌ ano de consulta
*   ❌ ano efetivamente trabalhado

Reforçando:
**Abono Salarial 2026 considera os meses trabalhados em 2024 (ano-base).**

## ✅ Conclusão

O Abono Salarial 2026 é um direito relevante para milhões de brasileiros e pode representar até um salário mínimo extra. Com pagamentos iniciando em 15 de fevereiro de 2026, a melhor estratégia é consultar cedo e acompanhar o calendário.

<Callout type="success">
  <p>📌 **Salve esta página e compartilhe com quem trabalhou com carteira assinada em 2024.**</p>
</Callout>
        $MDX$,
        '{"seo_title": "Abono Salarial 2026 (PIS/PASEP): Quem Tem Direito, Calendário e Consulta", "seo_description": "Guia completo do Abono Salarial 2026 (ano-base 2024). Confira o calendário de pagamentos, quem tem direito e valores atualizados.", "og_image_url": "/images/conteudos/abono_salarial_2026_cover.png", "keywords": ["abono salarial 2026", "pis pasep 2026", "calendario pis 2026"]}'::jsonb,
        5
    )
    ON CONFLICT (lang, slug) DO UPDATE SET
        title = EXCLUDED.title,
        excerpt = EXCLUDED.excerpt,
        content_mdx = EXCLUDED.content_mdx,
        metadata = EXCLUDED.metadata;

    -- 6. Link Tags
    INSERT INTO article_tags (article_id, tag_id)
    SELECT v_article_id, id FROM tags WHERE slug IN ('abono-salarial', 'pis', 'pasep', 'beneficios')
    ON CONFLICT (article_id, tag_id) DO NOTHING;

END $$;
