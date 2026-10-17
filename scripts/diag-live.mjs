#!/usr/bin/env node
/**
 * Diagnóstico E2E en vivo contra el proyecto Supabase REAL.
 * Reproduce el flujo host + móvil con sesiones anónimas e imprime el
 * código HTTP/mensaje exacto de cada operación para localizar los 403/409.
 *
 * Uso: node scripts/diag-live.mjs
 * NO usa service_role: exactamente las mismas claves/RLS que el navegador.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL_ || !ANON) { console.error("Faltan claves en .env.local"); process.exit(1); }

const results = [];
async function step(name, fn) {
  try {
    const out = await fn();
    results.push([name, "OK", out ?? ""]);
    console.log(`  OK   ${name}${out ? " :: " + JSON.stringify(out) : ""}`);
    return out;
  } catch (e) {
    const info = { msg: e?.message, code: e?.code, status: e?.status ?? e?.statusCode, details: e?.details };
    results.push([name, "ERR", info]);
    console.log(`  ERR  ${name} :: ${JSON.stringify(info)}`);
    return null;
  }
}
const must = (data, error) => { if (error) throw error; return data; };

console.log("=== 1. Sesion anonima (host) ===");
const host = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const hostAuth = await step("signInAnonymously(host)", async () => {
  const { data, error } = await host.auth.signInAnonymously();
  must(data, error);
  return { uid: data.user?.id };
});
if (!hostAuth) { console.log("FALLO CRITICO: no hay sesion anonima. Aborto."); process.exit(1); }
const hostUid = hostAuth.uid;

console.log("=== 2. Perfil (trigger handle_new_user) ===");
await step("select profiles(host)", async () => {
  const { data, error } = await host.from("profiles").select("*").eq("id", hostUid);
  must(data, error);
  return { rows: data.length };
});

console.log("=== 3. Crear torneo + membership admin (bootstrapping) ===");
const TID = crypto.randomUUID();
const CODE = "DG" + Math.random().toString(36).slice(2, 6).toUpperCase();
const TEAM_ID = crypto.randomUUID();
const LANE_ID = crypto.randomUUID();
const PLAYER_ID = crypto.randomUUID();
await step("insert tournaments", async () => {
  const { data, error } = await host.from("tournaments").insert({
    id: TID, name: "DIAG-TEMP", description: "", access_code: CODE,
    status: "registration", created_by: hostUid,
    settings: { laneCount: 1, teamCount: 1, playersPerLane: 4, maxPlayersTeam: 4 },
  }).select();
  must(data, error);
  return { id: data[0].id, code: data[0].access_code };
});
await step("upsert tournament_members(admin)", async () => {
  const { data, error } = await host.from("tournament_members")
    .upsert({ tournament_id: TID, user_id: hostUid, role: "admin" }, { onConflict: "tournament_id,user_id" })
    .select();
  must(data, error);
  return { role: data[0]?.role };
});
console.log("=== 4. Entidades base (teams/lanes/players) ===");
await step("insert teams", async () => { const { data, error } = await host.from("teams").insert({ id: TEAM_ID, tournament_id: TID, name: "DIAG-A", color: "#fff", accent: "#000", sort_order: 0 }).select(); return must(data, error); });
await step("insert lanes", async () => { const { data, error } = await host.from("lanes").insert({ id: LANE_ID, tournament_id: TID, name: "Pista 1", number: 1 }).select(); return must(data, error); });
await step("insert players(host)", async () => { const { data, error } = await host.from("players").insert({ id: PLAYER_ID, tournament_id: TID, user_id: hostUid, team_id: TEAM_ID, display_name: "HostDiag", avatar: "x" }).select(); return must(data, error); });

console.log("=== 5. PULL del host (lo que ve el panel) ===");
await step("pull players", async () => {
  const { data, error } = await host.from("players").select("*").eq("tournament_id", TID);
  must(data, error);
  return { n: data.length, names: data.map((p) => p.display_name) };
});
await step("rpc lookup_join_bundle", async () => {
  const { data, error } = await host.rpc("lookup_join_bundle", { code: CODE });
  must(data, error);
  return { found: !!data?.tournament };
});


console.log("=== 6. Movil: 2da sesion anonima, se une ===");
const mob = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const mobAuth = await step("signInAnonymously(mobile)", async () => {
  const { data, error } = await mob.auth.signInAnonymously();
  must(data, error);
  return { uid: data.user?.id };
});
if (mobAuth) {
  const mobUid = mobAuth.uid;
  const MPLAYER = crypto.randomUUID();
  await step("mobile rpc lookup_join_bundle", async () => {
    const { data, error } = await mob.rpc("lookup_join_bundle", { code: CODE });
    must(data, error);
    return { found: !!data?.tournament };
  });
  await step("mobile upsert members(self=player)", async () => { const { data, error } = await mob.from("tournament_members").upsert({ tournament_id: TID, user_id: mobUid, role: "player" }, { onConflict: "tournament_id,user_id" }).select(); return must(data, error); });
  await step("mobile insert players(self)", async () => { const { data, error } = await mob.from("players").insert({ id: MPLAYER, tournament_id: TID, user_id: mobUid, team_id: TEAM_ID, display_name: "MovilDiag", avatar: "x" }).select(); return must(data, error); });
  await step("mobile upsert members again (rol distinto?)", async () => { const { data, error } = await mob.from("tournament_members").upsert({ tournament_id: TID, user_id: mobUid, role: "admin" }, { onConflict: "tournament_id,user_id" }).select(); return must(data, error); });

  console.log("=== 7. Host vuelve a PULL: ve al movil? ===");
  await step("host pull players (2)", async () => {
    const { data, error } = await host.from("players").select("*").eq("tournament_id", TID);
    must(data, error);
    return { n: data.length, names: data.map((p) => p.display_name) };
  });

  console.log("=== 8. Casos limite (403/409) ===");
  await step("mobile update tournaments (no-admin, ¿403?)", async () => {
    const { data, error } = await mob.from("tournaments").update({ name: "HACK" }).eq("id", TID).select();
    must(data, error);
    return { rows: data.length };
  });
  await step("mobile update players ajeno (¿403?)", async () => {
    const { data, error } = await mob.from("players").update({ display_name: "HACKED" }).eq("id", PLAYER_ID).select();
    must(data, error);
    return { rows: data.length };
  });
  await step("mobile insert players DUPLICADO display_name (¿409?)", async () => {
    const { data, error } = await mob.from("players").insert({ id: crypto.randomUUID(), tournament_id: TID, user_id: mobUid, team_id: TEAM_ID, display_name: "HostDiag", avatar: "x" }).select();
    must(data, error);
    return data;
  });
  await step("host insert players DUPLICADO user_id (¿409?)", async () => {
    const { data, error } = await host.from("players").insert({ id: crypto.randomUUID(), tournament_id: TID, user_id: hostUid, team_id: TEAM_ID, display_name: "OtroNombre", avatar: "x" }).select();
    must(data, error);
    return data;
  });
  await step("host upsert players mismo id (idempotente?)", async () => { const { data, error } = await host.from("players").upsert({ id: PLAYER_ID, tournament_id: TID, user_id: hostUid, team_id: TEAM_ID, display_name: "HostDiagRenombrado", avatar: "x" }, { onConflict: "id" }).select(); return must(data, error); });
  await step("host upsert tournaments mismo id (status change?)", async () => { const { data, error } = await host.from("tournaments").upsert({ id: TID, name: "DIAG-TEMP2", description: "", access_code: CODE, status: "ready", created_by: hostUid, settings: { laneCount: 1 } }, { onConflict: "id" }).select(); return must(data, error); });
}

console.log("=== 9. REALTIME (5s) ===");
await new Promise((resolve) => {
  const ch = host.channel(`diag:${TID}`);
  let got = false;
  ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "players", filter: `tournament_id=eq.${TID}` }, (payload) => {
    got = true;
    console.log("  OK   realtime event:", payload.new?.display_name);
  }).subscribe((status) => {
    console.log("  realtime status:", status);
    if (status === "SUBSCRIBED" && mobAuth) {
      mob.from("players").insert({ id: crypto.randomUUID(), tournament_id: TID, user_id: mobAuth.uid, team_id: TEAM_ID, display_name: "RT-" + Date.now(), avatar: "x" }).then();
    }
    if (status === "CHANNEL_ERROR") { results.push(["realtime", "ERR", "CHANNEL_ERROR"]); resolve(); }
  });
  setTimeout(() => { results.push(["realtime(5s)", got ? "OK" : "ERR", { got }]); console.log(`  ${got ? "OK  " : "ERR "} realtime 5s: got=${got}`); resolve(); }, 6000);
});

console.log("\n=== RESUMEN ===");
for (const [n, s, i] of results) console.log(`${s.padEnd(3)} ${n}${typeof i === "object" && Object.keys(i || {}).length ? " " + JSON.stringify(i) : ""}`);

// Limpieza del torneo diagnostico (best-effort)
await host.from("players").delete().eq("tournament_id", TID);
await host.from("tournament_members").delete().eq("tournament_id", TID);
await host.from("lanes").delete().eq("tournament_id", TID);
await host.from("teams").delete().eq("tournament_id", TID);
await host.from("tournaments").delete().eq("id", TID);
console.log("Limpieza completada.");
process.exit(0);
