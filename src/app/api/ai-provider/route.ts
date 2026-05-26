import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const returnAll = request.nextUrl.searchParams.get('all') === 'true';

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error', details: 'Missing Supabase credentials' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── Return ALL providers (for fallback rotation) ──────────────────────
    if (returnAll) {
      const { data: allProviders, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', userId)
        .not('api_key', 'is', null);

      if (error) {
        return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
      }

      if (!allProviders || allProviders.length === 0) {
        return NextResponse.json(
          { error: 'No AI provider configured', details: 'No records found in ai_settings table for this user' },
          { status: 404 }
        );
      }

      // Sort: active first, then by provider name for deterministic order
      const sorted = [
        ...allProviders.filter((p: any) => p.is_active),
        ...allProviders.filter((p: any) => !p.is_active),
      ];

      return NextResponse.json(sorted);
    }

    // ── Return single active provider (legacy behaviour) ──────────────────
    console.log('[AI-Provider API] Fetching AI provider for userId:', userId);

    const { data: aiProvider, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    // If no active provider, try to get any provider for this user
    if (!aiProvider && !error) {
      const { data: anyProvider } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (anyProvider) {
        const { data: updated } = await supabase
          .from('ai_settings')
          .update({ is_active: true })
          .eq('id', anyProvider.id)
          .select()
          .single();

        if (updated) return NextResponse.json(updated);
      }
    }

    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }

    if (!aiProvider) {
      return NextResponse.json(
        { error: 'No AI provider configured', details: 'No records found in ai_settings table for this user', userId },
        { status: 404 }
      );
    }

    return NextResponse.json(aiProvider);

  } catch (err: any) {
    console.error('[AI-Provider API] UNEXPECTED ERROR:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
