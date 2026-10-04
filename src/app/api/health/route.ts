import { NextResponse } from 'next/server';

// Lightweight health-check endpoint for cron-job warmup pings.
//
// Serverless platforms (Alibaba Function Compute, Vercel, AWS Lambda, etc.)
// put idle functions to sleep after a period of inactivity (cold start).
// A cronjob that pings /api/health every 1–5 min keeps the function warm
// so user requests don't suffer cold-start latency.
//
// Design choices:
//   - GET only (no side effects, idempotent, cacheable)
//   - No auth (cron services can't authenticate easily)
//   - No rate limit (cron hits every few minutes; low traffic)
//   - No DB call (fast response, no resource usage)
//   - No logging (avoid log spam from cron pings)
//   - Returns minimal JSON: { ok, ts, uptime, region? }
//
// Recommended cron-job services:
//   - cron-job.org (free, EU-based)
//   - UptimeRobot (free tier, 5-min interval)
//   - EasyCron
//   - GitHub Actions (scheduled workflow)
//
// Recommended cron schedule: every 5 minutes (most free tiers' minimum
// interval). Sub-5-min cron is generally not necessary unless cold-start
// latency is critical.

// Track process start time for uptime reporting. Module-level constant,
// so it persists for the lifetime of the Node.js process (i.e. the
// lifetime of the warm serverless function instance).
const PROCESS_STARTED_AT_MS = Date.now();

export async function GET() {
  const now = Date.now();
  const uptimeSec = Math.round((now - PROCESS_STARTED_AT_MS) / 1000);

  return NextResponse.json(
    {
      ok: true,
      status: 'healthy',
      ts: new Date(now).toISOString(),
      uptimeSec,
      // region: process.env.FC_REGION || process.env.VERCEL_REGION || 'unknown',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        // Allow cron services to read the response without CORS issues.
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

// HEAD handler — even lighter than GET (no body). Some uptime monitors
// use HEAD requests to save bandwidth.
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
