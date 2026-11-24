import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, getServerSession } from "@/lib/auth";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    const cookieStore = await cookies();
    const hasStaleToken = Boolean(
      cookieStore.get(AUTH_COOKIE_NAME)?.value || cookieStore.get("token")?.value
    );
    redirect(hasStaleToken ? "/login?expired=1" : "/login");
  }

  return (
    <DashboardShell
      initialUser={{
        name: session.name,
        email: session.email,
        role: session.role,
        roleLabel: session.roleLabel,
        workspaceName: session.workspaceName,
        impersonatedBy: session.impersonatedBy,
      }}
    >
      {children}
    </DashboardShell>
  );
}
