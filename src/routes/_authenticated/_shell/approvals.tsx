import { createFileRoute, redirect } from "@tanstack/react-router";

// Approvals were merged into the tickets system; keep old links working.
export const Route = createFileRoute("/_authenticated/_shell/approvals")({
  beforeLoad: () => { throw redirect({ to: "/tickets", search: { status: "PENDING_APPROVAL" } }); },
});
