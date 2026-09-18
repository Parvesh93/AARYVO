import OutreachReviewClient from "./OutreachReviewClient";
import { listDraftOutreachPreviews } from "@/lib/outreach-review";

export default async function OutreachReviewPage() {
  const previews = await listDraftOutreachPreviews();
  const defaultLimit = Math.max(
    1,
    Math.min(15, Number(process.env.OUTREACH_DAILY_LIMIT || 5)),
  );

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">
        Sales outreach
      </p>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-.045em]">
            Outreach review
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
            Review personalized Aaryvo outreach before it is sent. Select only
            the emails you approve; skipped drafts are never sent.
          </p>
        </div>
        <div className="w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
          Manual approval required
        </div>
      </div>

      <div className="mt-8">
        <OutreachReviewClient
          initialPreviews={previews.map((p) => ({
            id: p.id,
            company: p.company,
            website: p.website,
            recipient: p.recipient,
            emailType: p.emailType,
            followUpNumber: p.followUpNumber,
            subject: p.subject,
            htmlBody: p.htmlBody,
            textBody: p.textBody,
            observation: p.observation,
            createdAt: p.createdAt.toISOString(),
          }))}
          defaultLimit={defaultLimit}
        />
      </div>
    </div>
  );
}
