import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import PlatformLayout from "@/components/platform/PlatformLayout";

export default async function Dashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  return (
    <PlatformLayout
      userId={user.id}
      userEmail={user.email}
    />
  );
}
