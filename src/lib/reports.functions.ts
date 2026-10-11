import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REPORTS, SOURCES, fmtCell, reportByKey, type Col } from "./reports";

const runInput = z.object({
  orgId: z.string().uuid(),
  key: z.string().max(60).optional(),
  source: z.string().max(40).optional(),
  columns: z.array(z.string().max(40)).max(20).optional(),
  status: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branches: z.array(z.string().uuid()).max(50).optional(),
  format: z.enum(["xlsx", "csv", "pdf"]),
  title: z.string().max(120).optional(),
});

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

/** Re-runs the report server-side as the caller (RLS + permission checks in SQL), builds the file, stores it privately and logs the run. */
export const exportReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => runInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let cols: Col[]; let name: string; let key: string;
    let res;
    if (data.key) {
      const def = reportByKey(data.key);
      if (!def) throw new Error("דוח לא מוכר");
      const perm = await sb.rpc("my_report_permissions", { _org: data.orgId });
      const p = (perm.data as Record<string, { export: boolean }> | null)?.[data.key];
      if (!p?.export) throw new Error("אין הרשאת ייצוא לדוח זה");
      cols = def.cols; name = data.title || def.name; key = def.key;
      res = await sb.rpc(reportRpc(data.key), { _org: data.orgId, _key: data.key, _from: data.from, _to: data.to, _branches: data.branches ?? [] });
    } else {
      const src = SOURCES.find((s) => s.key === data.source);
      if (!src || !data.columns?.length) throw new Error("הגדרות דוח חסרות");
      cols = src.cols.filter((c) => data.columns!.includes(c.key)); name = data.title || `דוח ${src.label}`; key = `custom:${src.key}`;
      res = await sb.rpc("run_custom_report", { _org: data.orgId, _source: src.key, _columns: data.columns, _from: data.from, _to: data.to, _branches: data.branches ?? [], _status: data.status ?? "" });
    }
    if (res.error) throw new Error(res.error.message);
    const out = res.data as { rows: Record<string, unknown>[]; branches: string[] };
    const rows = out.rows ?? [];

    const { data: brs } = await sb.from("branches").select("id,name").in("id", out.branches.length ? out.branches : ["00000000-0000-0000-0000-000000000000"]);
    const branchNames = (brs ?? []).map((b) => b.name).join(", ") || "—";
    const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const range = `${data.from.split("-").reverse().join("/")} – ${data.to.split("-").reverse().join("/")}`;
    const header = [[name], [`סניפים: ${branchNames}`], [`טווח: ${range}`], [`הופק: ${now}`], []];
    const table = [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => fmtCell(r[c.key], c)))];

    const { data: me } = await sb.rpc("current_member_id", { _org: data.orgId });
    const stamp = Date.now();
    let filePath: string | null = null; let fileUrl: string | null = null; let html: string | null = null;

    if (data.format === "pdf") {
      html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(name)}</title><style>
        body{font-family:Rubik,Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0;font-size:12px;color:#555}
        table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}th{background:#f1f3f6}
        </style></head><body><h1>${esc(name)}</h1><p>סניפים: ${esc(branchNames)} · טווח: ${range} · הופק: ${esc(now)} · ${rows.length} שורות</p>
        <table><thead><tr>${table[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${table.slice(1).map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
        <script>window.onload=()=>window.print()</script></body></html>`;
    } else {
      let body: Uint8Array; let type: string;
      if (data.format === "csv") {
        const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csv = "\uFEFF" + [...header, ...table].map((r) => r.map((v) => q(String(v))).join(",")).join("\r\n");
        body = new TextEncoder().encode(csv); type = "text/csv;charset=utf-8";
      } else {
        const XLSX = await import("xlsx");
        // Keep money/number columns numeric in Excel so they can be summed
        const numeric = (c: Col) => c.type === "money" || c.type === "number";
        const xrows = rows.map((r) => cols.map((c) => (numeric(c) && r[c.key] !== null && r[c.key] !== "" && !isNaN(Number(r[c.key])) ? Number(r[c.key]) : fmtCell(r[c.key], c))));
        const ws = XLSX.utils.aoa_to_sheet([...header, table[0], ...xrows]);
        cols.forEach((c, ci) => { if (c.type !== "money") return; for (let ri = 0; ri < xrows.length; ri++) { const cell = ws[XLSX.utils.encode_cell({ r: header.length + 1 + ri, c: ci })]; if (cell && cell.t === "n") cell.z = '"₪"#,##0.##'; } });
        ws["!cols"] = cols.map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        wb.Workbook = { Views: [{ RTL: true }] };
        XLSX.utils.book_append_sheet(wb, ws, "דוח");
        body = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
        type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      filePath = `${data.orgId}/${context.userId}/${stamp}-${key.replace(/[^a-z_:]/gi, "")}.${data.format}`.replace(":", "-");
      const up = await sb.storage.from("report-exports").upload(filePath, body, { contentType: type });
      if (up.error) throw new Error("שמירת הקובץ נכשלה");
      const signed = await sb.storage.from("report-exports").createSignedUrl(filePath, 300, { download: `${name}.${data.format}` });
      fileUrl = signed.data?.signedUrl ?? null;
    }

    await sb.from("report_runs").insert({
      organization_id: data.orgId, member_id: me as string | null, user_id: context.userId, report_key: key, report_name: name,
      params: { from: data.from, to: data.to, branches: data.branches ?? [], source: data.source, columns: data.columns, status: data.status },
      branch_ids: out.branches, format: data.format, row_count: rows.length, file_path: filePath,
    });
    return { url: fileUrl, html, rows: rows.length };
  });

/** Natural-language search: the model may only pick a catalog report and a date range; results still come from run_report. */
export const aiReportSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid(), q: z.string().trim().min(2).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const perm = await context.supabase.rpc("my_report_permissions", { _org: data.orgId });
    const permsMap = perm.data as Record<string, { view: boolean }> | null;
    if (!permsMap?.["_builder"]?.view) return { ok: false as const, error: "החיפוש החכם זמין למנהלים בלבד" };
    const allowed = REPORTS.filter((r) => permsMap?.[r.key]?.view && !r.unavailable);
    if (!allowed.length) return { ok: false as const, error: "אין דוחות זמינים עבורך" };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "החיפוש החכם אינו זמין כרגע" };
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: `You map Hebrew questions from gym staff to ONE report from this catalog. Today is ${today}. Catalog:\n${allowed.map((x) => `${x.key}: ${x.name} — ${x.desc}`).join("\n")}\nIf nothing fits, use report_key "none". Card digits search is not supported. Use empty strings for from/to unless range is custom.`,
        input: [{ role: "user", content: data.q }],
        text: { format: { type: "json_schema", name: "pick_report", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["report_key", "range", "from", "to", "explanation"],
          properties: {
            report_key: { type: "string", enum: [...allowed.map((x) => x.key), "none"] },
            range: { type: "string", enum: ["today", "week", "month", "prev_month", "year", "custom"] },
            from: { type: "string" }, to: { type: "string" },
            explanation: { type: "string" },
          } } } },
      }),
    });
    if (r.status === 429) return { ok: false as const, error: "יותר מדי בקשות, נסה שוב בעוד רגע" };
    if (r.status === 402) return { ok: false as const, error: "החיפוש החכם אינו זמין (נגמרה המכסה)" };
    if (!r.ok || !r.body) { console.error("ai search", r.status, await r.text()); return { ok: false as const, error: "החיפוש החכם נכשל" }; }
    let text = ""; let buf = "";
    const reader = r.body.getReader(); const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try { const ev = JSON.parse(l.slice(5).trim()); if (ev.type === "response.output_text.delta") text += ev.delta ?? ""; } catch { /* keep-alive */ }
      }
    }
    let args: Record<string, string> = {};
    try { args = JSON.parse(text); } catch { return { ok: false as const, error: "החיפוש החכם נכשל" }; }
    if (!args.report_key || args.report_key === "none" || !allowed.some((x) => x.key === args.report_key))
      return { ok: false as const, error: "לא מצאתי דוח מתאים. נסה לנסח אחרת או לחפש בספרייה." };
    const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
    return { ok: true as const, key: args.report_key as string, range: args.range as string, from: ok(args.from), to: ok(args.to), explanation: String(args.explanation ?? "") };
  });

/** Branch management report export: re-runs branch_management_report as the caller and builds a multi-section Excel or printable PDF. */
export const exportBranchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    orgId: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    branches: z.array(z.string().uuid()).max(50).optional(), format: z.enum(["xlsx", "pdf"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { KPIS, MOVEMENT, DETAILS, NET_NOTE, REQUESTS_NOTE, REQUESTS_UNAVAILABLE, TRANSFERS_NOTE, fmtKpi, fmtReportKpi, pctChange, bmWarnings } = await import("./branch-report");
    const sb = context.supabase;
    const res = await sb.rpc("branch_management_report", { _org: data.orgId, _from: data.from, _to: data.to, _branches: data.branches ?? [] });
    if (res.error) throw new Error(res.error.message);
    const r = res.data as unknown as import("./branch-report").BmResult;
    if (!r.export) throw new Error("אין הרשאת ייצוא לדוח זה");
    const name = "דוח ניהול סניף";
    const { data: brs } = await sb.from("branches").select("id,name").in("id", r.branches.length ? r.branches : ["00000000-0000-0000-0000-000000000000"]);
    const branchNames = (brs ?? []).map((b) => b.name).join(", ") || "—";
    const d = (s: string) => s.split("-").reverse().join("/");
    const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const head = [[name], [`סניפים: ${branchNames}`], [`תקופה: ${d(r.from)} – ${d(r.to)} · תקופת השוואה: ${d(r.prev_from)} – ${d(r.prev_to)}`], [`הופק: ${now}`], ...bmWarnings(r.current).map((w) => [w]), ...(!r.requests_available ? [[REQUESTS_NOTE]] : []), [NET_NOTE], [TRANSFERS_NOTE], ["ביטולים חסרי תאריך: כל המנויים המבוטלים ללא תאריך ביטול בסניפים שנבחרו, ללא שיוך לטווח התאריכים."], []];
    const pc = (k: string) => { const p = pctChange(r.current[k], r.previous[k]); return p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`; };
    const summary = [["מדד", "תקופה נוכחית", "תקופה קודמת", "שינוי"],
      ...KPIS.map((k) => [k.label, fmtReportKpi(r.current, k.key, r.requests_available, k.type), fmtReportKpi(r.previous, k.key, r.requests_available, k.type), k.type === "percent" || (k.key === "req_total" && !r.requests_available) ? "" : pc(k.key)]),
      [], ["תנועת מנויים", "תקופה נוכחית", "תקופה קודמת", "שינוי"],
      ...MOVEMENT.map((m) => [m.label, fmtKpi(r.current[m.key]), fmtKpi(r.previous[m.key]), pc(m.key)]),
      [], ["בקשות ביטול", "פתוחות", "טופלו", "הושלמו"], ["", ...["req_open", "req_handled", "req_completed"].map((key) => fmtReportKpi(r.current, key, r.requests_available))]];
    const byBranch = r.by_branch?.length ? [["סניף", ...KPIS.map((k) => k.label)], ...r.by_branch.map((b) => [b.branch, ...KPIS.map((k) => fmtReportKpi(b, k.key, r.requests_available, k.type))])] : null;
    const sections = DETAILS.map((s) => ({ label: s.label, unavailable: s.key === "requests" && !r.requests_available, rows: [s.cols.map((c) => c.label), ...(r.details[s.key] ?? []).map((row) => s.cols.map((c) => fmtCell(row[c.key], c)))] }));
    const { data: me } = await sb.rpc("current_member_id", { _org: data.orgId });
    let filePath: string | null = null; let url: string | null = null; let html: string | null = null;
    if (data.format === "pdf") {
      const tbl = (rows: string[][]) => `<table><thead><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((x) => `<tr>${x.map((v) => `<td>${esc(String(v))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(name)}</title><style>
        body{font-family:Rubik,Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 4px}p{margin:0;font-size:12px;color:#555}
        table{border-collapse:collapse;width:100%;margin-top:6px;font-size:11px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}th{background:#f1f3f6}tr{page-break-inside:avoid}
        </style></head><body><h1>${esc(name)}</h1>${head.slice(1).filter((x) => x.length).map((x) => `<p>${esc(x[0])}</p>`).join("")}
        <h2>סיכום</h2>${tbl(summary.filter((x) => x.length) as string[][])}${byBranch ? `<h2>השוואה בין סניפים</h2>${tbl(byBranch)}` : ""}
        ${sections.map((s) => `<h2>${esc(s.label)}${s.unavailable ? "" : ` (${s.rows.length - 1})`}</h2>${s.unavailable ? `<p>${esc(REQUESTS_UNAVAILABLE)} · ${esc(REQUESTS_NOTE)}</p>` : s.rows.length > 1 ? tbl(s.rows) : "<p>אין רשומות</p>"}`).join("")}
        <script>window.onload=()=>window.print()</script></body></html>`;
    } else {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
      const add = (title: string, rows: unknown[][]) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = Array.from({ length: 8 }, () => ({ wch: 20 })); XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31)); };
      add("סיכום", [...head, ...summary]);
      if (byBranch) add("השוואה בין סניפים", byBranch);
      sections.forEach((s) => add(s.label, s.unavailable ? [[REQUESTS_UNAVAILABLE], [REQUESTS_NOTE]] : s.rows));
      const body = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
      filePath = `${data.orgId}/${context.userId}/${Date.now()}-branch_mgmt.xlsx`;
      const up = await sb.storage.from("report-exports").upload(filePath, body, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (up.error) throw new Error("שמירת הקובץ נכשלה");
      url = (await sb.storage.from("report-exports").createSignedUrl(filePath, 300, { download: `${name}.xlsx` })).data?.signedUrl ?? null;
    }
    await sb.from("report_runs").insert({ organization_id: data.orgId, member_id: me as string | null, user_id: context.userId, report_key: "branch_mgmt", report_name: name,
      params: { from: data.from, to: data.to, branches: data.branches ?? [] }, branch_ids: r.branches, format: data.format,
      row_count: DETAILS.reduce((n, s) => n + (r.details[s.key]?.length ?? 0), 0), file_path: filePath });
    return { url, html };
  });
