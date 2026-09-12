#!/usr/bin/env node
/**
 * One-off migration: move property photos/videos out of the private
 * `documents` bucket into the public `property-media` bucket and rewrite the
 * URLs stored in the database.
 *
 *   node apps/web/scripts/migrate-property-media.mjs            # dry run (default)
 *   node apps/web/scripts/migrate-property-media.mjs --apply    # perform the migration
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * apps/web/.env.local (or the environment). Idempotent: objects already moved
 * and URLs already rewritten are skipped, so it is safe to re-run.
 *
 * Run AFTER deploying the code that uploads new media to `property-media`
 * and BEFORE running security_2026_09_documents_split.sql (which makes the
 * `documents` bucket private).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const SRC = "documents";
const DST = "property-media";
const MEDIA_PREFIXES = ["photos/", "videos/"];

const supabase = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (...a) => console.log(APPLY ? "[apply]" : "[dry-run]", ...a);

// ── helpers ──────────────────────────────────────────────────────────────────

async function ensureBucket() {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (buckets.some((b) => b.name === DST)) {
        log(`bucket ${DST} exists`);
        return;
    }
    log(`creating public bucket ${DST}`);
    if (!APPLY) return;
    const { error: createErr } = await supabase.storage.createBucket(DST, { public: true });
    if (createErr) throw createErr;
}

/** Recursively lists object paths under a prefix in a bucket. */
async function listAll(bucket, prefix) {
    const out = [];
    const stack = [prefix.replace(/\/$/, "")];
    while (stack.length) {
        const folder = stack.pop();
        let offset = 0;
        for (;;) {
            const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset });
            if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
            if (!data || data.length === 0) break;
            for (const item of data) {
                const path = folder ? `${folder}/${item.name}` : item.name;
                // Folders come back with id === null
                if (item.id === null) stack.push(path);
                else if (item.name !== ".emptyFolderPlaceholder") out.push(path);
            }
            if (data.length < 1000) break;
            offset += data.length;
        }
    }
    return out;
}

async function moveObject(fromPath, toPath) {
    if (!APPLY) return true;
    // storage-js ≥ 2.5 supports cross-bucket move
    const { error } = await supabase.storage.from(SRC).move(fromPath, toPath, { destinationBucket: DST });
    if (!error) return true;
    if (/already exists|Duplicate/i.test(error.message)) {
        // Destination present from a previous run → drop the source copy
        await supabase.storage.from(SRC).remove([fromPath]);
        return true;
    }
    // Fallback: download → upload → remove
    console.warn(`  move failed (${error.message}); falling back to copy for ${fromPath}`);
    const { data: blob, error: dlErr } = await supabase.storage.from(SRC).download(fromPath);
    if (dlErr || !blob) {
        console.error(`  download failed for ${fromPath}: ${dlErr?.message}`);
        return false;
    }
    const { error: upErr } = await supabase.storage
        .from(DST)
        .upload(toPath, Buffer.from(await blob.arrayBuffer()), { contentType: blob.type || undefined, upsert: true });
    if (upErr) {
        console.error(`  upload failed for ${toPath}: ${upErr.message}`);
        return false;
    }
    await supabase.storage.from(SRC).remove([fromPath]);
    return true;
}

const PUBLIC_SRC = `/storage/v1/object/public/${SRC}/`;
const PUBLIC_DST = `/storage/v1/object/public/${DST}/`;

/** Rewrites documents→property-media URLs for photos/videos inside any JSON value. Returns [newValue, changed]. */
function rewriteMediaUrls(value) {
    let changed = false;
    const walk = (v) => {
        if (typeof v === "string") {
            for (const p of MEDIA_PREFIXES) {
                const from = PUBLIC_SRC + p;
                if (v.includes(from)) {
                    changed = true;
                    return v.split(from).join(PUBLIC_DST + p);
                }
            }
            return v;
        }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === "object") {
            const o = {};
            for (const [k, x] of Object.entries(v)) o[k] = walk(x);
            return o;
        }
        return v;
    };
    const out = walk(value);
    return [out, changed];
}

// ── steps ────────────────────────────────────────────────────────────────────

async function migrateMediaObjects() {
    let total = 0, ok = 0;
    for (const prefix of MEDIA_PREFIXES) {
        const paths = await listAll(SRC, prefix);
        log(`${paths.length} object(s) under ${SRC}/${prefix}`);
        for (const p of paths) {
            total++;
            if (await moveObject(p, p)) ok++;
        }
    }
    log(`media objects: ${ok}/${total} moved`);
}

async function migrateListingPhotos() {
    // Listing photos were uploaded to documents/<profileId>/<ts>.<ext> (same
    // prefix as ownership proofs). Move only the objects referenced by listings.
    const { data: listings, error } = await supabase.from("listings").select("id, photos");
    if (error) {
        if (/does not exist/i.test(error.message)) return log("no listings table, skipping");
        throw error;
    }
    let moved = 0, rows = 0;
    for (const row of listings ?? []) {
        if (!Array.isArray(row.photos) || row.photos.length === 0) continue;
        let changed = false;
        const photos = [];
        for (const url of row.photos) {
            if (typeof url !== "string" || !url.includes(PUBLIC_SRC)) { photos.push(url); continue; }
            const path = decodeURIComponent(url.split(PUBLIC_SRC)[1].split("?")[0]);
            if (MEDIA_PREFIXES.some((p) => path.startsWith(p))) {
                photos.push(url.replace(PUBLIC_SRC, PUBLIC_DST));
                changed = true;
                continue;
            }
            const dest = `listings/${path}`;
            if (await moveObject(path, dest)) {
                photos.push(url.replace(PUBLIC_SRC + path, PUBLIC_DST + dest));
                changed = true;
                moved++;
            } else {
                photos.push(url);
            }
        }
        if (changed) {
            rows++;
            log(`listing ${row.id}: rewriting ${photos.length} photo URL(s)`);
            if (APPLY) {
                const { error: upErr } = await supabase.from("listings").update({ photos }).eq("id", row.id);
                if (upErr) console.error(`  update listing ${row.id}: ${upErr.message}`);
            }
        }
    }
    log(`listings: ${moved} object(s) moved, ${rows} row(s) rewritten`);
}

async function rewriteProfiles() {
    const cols = ["property_photos", "property_videos", "sub_units", "additional_properties", "profile_photo_url"];
    const { data: profiles, error } = await supabase.from("profiles").select(["id", ...cols].join(", "));
    if (error) throw error;
    let rows = 0;
    for (const row of profiles ?? []) {
        const patch = {};
        for (const col of cols) {
            if (row[col] === null || row[col] === undefined) continue;
            const [next, changed] = rewriteMediaUrls(row[col]);
            if (changed) patch[col] = next;
        }
        if (Object.keys(patch).length === 0) continue;
        rows++;
        log(`profile ${row.id}: rewriting ${Object.keys(patch).join(", ")}`);
        if (APPLY) {
            const { error: upErr } = await supabase.from("profiles").update(patch).eq("id", row.id);
            if (upErr) console.error(`  update profile ${row.id}: ${upErr.message}`);
        }
    }
    log(`profiles: ${rows} row(s) rewritten`);
}

async function report() {
    const left = (await Promise.all(MEDIA_PREFIXES.map((p) => listAll(SRC, p)))).flat();
    log(`remaining media objects in ${SRC}: ${left.length}`);
    const { data: profiles } = await supabase.from("profiles").select("id, property_photos, property_videos, sub_units, additional_properties, profile_photo_url");
    const stale = (profiles ?? []).filter((r) => JSON.stringify(r).includes(PUBLIC_SRC + "photos/") || JSON.stringify(r).includes(PUBLIC_SRC + "videos/"));
    log(`profiles still referencing ${SRC} media: ${stale.length}`);
    if (!APPLY) console.log("\nDry run only. Re-run with --apply to perform the migration.");
}

await ensureBucket();
await migrateMediaObjects();
await migrateListingPhotos();
await rewriteProfiles();
await report();
