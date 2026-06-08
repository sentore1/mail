import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const defaultSettings = {
    whatsapp_number: "",
    enabled: false,
    sender_name: "",
    events: ["reply.received", "email.opened"],
  };

  try {
    const service = createServiceClient();
    const { data } = await service
      .from("whatsapp_notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ settings: data ?? defaultSettings });
  } catch {
    // Table doesn't exist yet — return defaults silently
    return NextResponse.json({ settings: defaultSettings });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.whatsapp_number && !/^\+\d{7,15}$/.test(body.whatsapp_number)) {
    return NextResponse.json(
      { error: "Invalid phone number. Use international format: +250788123456" },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const { data, error: dbErr } = await service
      .from("whatsapp_notification_settings")
      .upsert({
        user_id: user.id,
        whatsapp_number: body.whatsapp_number || "",
        enabled: body.enabled ?? false,
        sender_name: body.sender_name || "",
        events: body.events ?? [],
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return NextResponse.json({ success: true, settings: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
