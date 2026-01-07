DO $$
DECLARE
    v_index_id UUID;
BEGIN
    SELECT id INTO v_index_id FROM public.economic_indexes WHERE code = 'IVAR';

    -- Insert or Update December 2025 Value
    -- IVAR variação mensal: 0.51%
    -- IVAR acumulado 12 meses: 8.85% (Source: FGV Release today 07/01/2026)
    INSERT INTO public.economic_index_values (
        index_id, 
        year, 
        month, 
        reference_date, 
        value_percent, 
        accumulated_12m,
        published_at, 
        source_url
    ) VALUES (
        v_index_id, 
        2025, 
        12, 
        '2025-12-01', 
        0.51, 
        8.85, 
        '2026-01-07', 
        'https://portal.fgv.br/noticias'
    )
    ON CONFLICT (index_id, year, month) 
    DO UPDATE SET 
        value_percent = EXCLUDED.value_percent,
        accumulated_12m = EXCLUDED.accumulated_12m,
        published_at = EXCLUDED.published_at,
        source_url = EXCLUDED.source_url;
END $$;
