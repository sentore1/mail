import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    console.log('[API] Fetching AI provider for userId:', userId);
    
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // Use service role key on server side
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    console.log('[API] Querying ai_providers table...');

    const { data: aiProvider, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    console.log('[API] Query result:', { aiProvider, error });

    if (error || !aiProvider) {
      console.error('[API] Error or no provider:', error);
      return NextResponse.json(
        { 
          error: 'No active AI provider found', 
          details: error?.message || 'No data',
          userId,
          hint: 'Check if ai_providers table exists and has data for this user'
        },
        { status: 404 }
      );
    }

    console.log('[API] Success! Returning provider:', aiProvider.provider);
    return NextResponse.json(aiProvider);
  } catch (err: any) {
    console.error('[API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
