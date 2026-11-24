import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, getServerSession } from "@/lib/auth";

export default async function RootPage() {
  const session = await getServerSession();
  if (!session) {
    const cookieStore = await cookies();
    const hasStaleToken = Boolean(
      cookieStore.get(AUTH_COOKIE_NAME)?.value || cookieStore.get("token")?.value
    );
    redirect(hasStaleToken ? "/login?expired=1" : "/login");
  }
  if (session.role === "super_admin") {
    redirect("/super-admin");
  }
  redirect("/overview");
}
