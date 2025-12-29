
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Check for Vercel Cron Secret (Authentication)
    // Vercel automatically sends this header when triggering the cron
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        // 1. Fetch latest IGP-M data from BCB (Series 189)
        // Series 189: IGP-M - Var. % mensal
        const response = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/ultimos/1?formato=json');

        if (!response.ok) {
            throw new Error(`Failed to fetch from BCB: ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No data received from BCB API');
        }

        const latestEntry = data[0];
        // Format: { data: "01/12/2025", valor: "-0.01" }
        const { data: dateStr, valor } = latestEntry;

        const [day, month, year] = dateStr.split('/').map(Number);
        const valuePercent = parseFloat(valor);

        console.log(`Latest IGP-M from BCB: ${month}/${year} = ${valuePercent}%`);

        // 2. Update Supabase
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing Supabase credentials (SUPABASE_SERVICE_ROLE_KEY)');
        }

        // Use service role key to bypass RLS and allow writes
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get IGPM Index ID
        const { data: indexData, error: indexError } = await supabase
            .from('economic_indexes')
            .select('id')
            .eq('code', 'IGPM')
            .single();

        if (indexError || !indexData) {
            throw new Error('IGPM index not found in database');
        }

        const indexId = indexData.id;

        // Check if this month's data already exists
        const { data: existingData, error: existingError } = await supabase
            .from('economic_index_values')
            .select('id, value_percent')
            .eq('index_id', indexId)
            .eq('year', year)
            .eq('month', month)
            .single();

        if (existingError && existingError.code !== 'PGRST116') { // PGRST116 is "No rows found"
            throw existingError;
        }

        if (existingData) {
            // If exists, check if value needs update
            if (existingData.value_percent !== valuePercent) {
                const { error: updateError } = await supabase
                    .from('economic_index_values')
                    .update({
                        value_percent: valuePercent,
                        source_url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/ultimos/1?formato=json',
                        // reset projection flag if it was a projection
                        is_projection: false
                    })
                    .eq('id', existingData.id);

                if (updateError) throw updateError;

                return NextResponse.json({
                    success: true,
                    action: 'updated',
                    message: `IGP-M for ${month}/${year} updated to ${valuePercent}%`
                });
            }

            return NextResponse.json({
                success: true,
                action: 'skipped',
                message: `IGP-M for ${month}/${year} already exists and is up to date.`
            });
        }

        // Insert new record
        const referenceDate = `${year}-${String(month).padStart(2, '0')}-01`;

        const { error: insertError } = await supabase
            .from('economic_index_values')
            .insert({
                index_id: indexId,
                year: year,
                month: month,
                reference_date: referenceDate,
                value_percent: valuePercent,
                is_projection: false,
                source_url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/ultimos/1?formato=json'
            });

        if (insertError) throw insertError;

        return NextResponse.json({
            success: true,
            action: 'inserted',
            message: `IGP-M for ${month}/${year} inserted successfully (${valuePercent}%)`
        });

    } catch (error: any) {
        console.error('Error updating IGP-M:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
