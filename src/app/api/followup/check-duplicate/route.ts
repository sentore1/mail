/**
 * POST /api/followup/check-duplicate
 *
 * Returns { isDuplicate: true } if a follow-up at this stage
 * was already sent to this lead in the last 24 hours.
 * Called by the manual UI and the auto processor.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId, followupNumber } = await req.json() as {
    leadId: string;
    followupNumber: number;
  };

  const service = createServiceClient();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await service
    .from("sent_emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("lead_id", leadId)
    .eq("followup_number", followupNumber)
    .eq("status", "sent")
    .gte("sent_at", cutoff);

  return NextResponse.json({ isDuplicate: (count ?? 0) > 0 });
}
