import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OrgProvider } from "@/lib/org";
import { AppShell } from "@/components/app/AppShell";
import { TaskReminders } from "@/components/app/TaskReminders";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <OrgProvider
      fallback={
        <div className="flex min-h-screen">
          <div className="hidden w-60 border-e bg-sidebar lg:block" />
          <div className="flex-1 space-y-4 p-8">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      }
      noOrg={
        <div className="flex min-h-screen items-center justify-center p-6 text-center">
          <div>
            <p className="font-medium">החשבון שלך עדיין לא משויך לארגון</p>
            <p className="mt-1 text-sm text-muted-foreground">בקש ממנהל הארגון להזמין אותך.</p>
          </div>
        </div>
      }
    >
      <AppShell>
        <Outlet />
        <TaskReminders />
      </AppShell>
    </OrgProvider>
  );
}
