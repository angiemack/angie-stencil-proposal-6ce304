import { internalAction, type RemotionCompletePayload } from "~stencil/internal";

/**
 * Trusted inbound route the platform calls when a video render reaches a terminal
 * state. `internalAction` (from `~stencil/internal`) owns the platform side —
 * bearer check against `SCHEDULE_TRIGGER_SECRET`, JSON parse, and the retry
 * contract — and calls the handler below with the parsed payload.
 *
 * The platform POSTs here with `Authorization: Bearer <SCHEDULE_TRIGGER_SECRET>`
 * and a JSON body `{ jobId, status, key?, durationSeconds?, error? }`. `status`
 * is `succeeded` | `failed` | `cancelled`; on `succeeded`, `key` is the finished
 * video's R2 key in this app's own storage (serve it from your own route — see
 * the `storage` skill).
 *
 * Delivery is at-least-once, so a completion can arrive more than once — keep the
 * handler idempotent, keyed on `jobId` (e.g. return early if the row is already
 * finished). The webhook is purely additive: `createRemotion(env).status(jobId)`
 * always works, so polling is a complete alternative and a missed delivery just
 * means you read the final state from there instead.
 */

/**
 * Handle one completed render. Look up your own record by `payload.jobId` and
 * update it — on `succeeded`, save `payload.key` as the video. Idempotent: return
 * early if this job is already handled, since the same completion can arrive twice.
 */
async function onRemotionComplete(payload: RemotionCompletePayload, env: Env): Promise<void> {}

export const action = internalAction<RemotionCompletePayload>(onRemotionComplete);
