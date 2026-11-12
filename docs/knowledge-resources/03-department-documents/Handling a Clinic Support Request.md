# Handling a Clinic Support Request

## Summary

The procedure "Handling a Clinic Support Request" describes how a support request from a MyClinicSoft clinic is opened, answered and resolved in the in-app support request system. Clinic administrators open requests in Admin → Support (`/admin/support`), and platform admins answer them in the platform console under Support (`/platform/support`). Every request gets a reference in the format SR-XXXXXX and moves through four statuses: Open, In progress, Resolved and Closed. The procedure is for platform admins and for the support team [TO CONFIRM: support role title]. Requests that concern privacy, data deletion, SMS opt-outs or a suspected breach leave this procedure and follow their own procedure.

## Purpose

The procedure "Handling a Clinic Support Request" exists so that every clinic question is answered from one queue, with the whole conversation kept on the request and the clinic told of each reply by email and in the app. The platform console sorts the queue by last activity and shows which requests are waiting on the platform team (source: lib/platform-console.ts; models/SupportRequest.ts).

## When this procedure applies

The procedure "Handling a Clinic Support Request" applies to:

- requests opened by a clinic administrator in Admin → Support;
- requests opened by a medical representative in the MyClinicSoft Rep app, which land in the same queue without a clinic attached (the Rep app is not yet released).

The procedure does not apply, or applies only until the request is recognised, to:

| Request | Procedure that applies instead |
|---|---|
| A patient asks to erase their data | "Handling a Patient Data Erasure Request" |
| A closed clinic asks for its data to be deleted | "Deleting a Closed Clinic's Data" |
| A patient or clinic asks to stop text messages | "Handling an SMS Opt-Out" |
| Anyone reports a possible data leak or unauthorised access | "Responding to a Suspected Data Breach" |
| A new clinic needs setting up | "Onboarding a New Clinic" |
| A clinic needs eMCR activation vouchers | "Issuing eMCR Activation Voucher Batches" |

Messages sent to support@myclinicsoft.solutions or through the website contact form do not create a support request: the contact form only opens an email in the visitor's own mail app (source: components/ContactForm.tsx). How those emails are tracked is [TO CONFIRM: handling of support mailbox emails].

## Roles involved

| Role | Responsibility |
|---|---|
| Administrator (clinic administrator) | Opens the request, answers questions from the platform team, reopens the request if the problem is not fixed. Only clinic administrators can open or reply to requests; other staff are refused with "Only clinic administrators can contact support" and are told on the Help Center to ask their clinic administrator |
| Medical representative | Opens requests from the MyClinicSoft Rep app and sees replies there |
| Platform admin | Answers requests in the platform console, sets the status, and uses the clinic tools (view as clinic, extend the current period, suspend or reactivate) when a request needs them |
| Support team | [TO CONFIRM: whether a separate support role exists or platform admins answer every request] |
| Data Protection Officer | Takes over privacy requests (privacy@myclinicsoft.solutions) |

Sources: app/api/support/route.ts; app/(public)/support/page.tsx; lib/platform-auth.ts; components/platform/ClinicActions.tsx.

## Inputs needed before starting

The fields of a support request and their limits:

| Field | Values or limits |
|---|---|
| Subject | 3–200 characters |
| About (category) | General question; Something is not working; Billing or subscription; Accounts and sign-in; Getting set up; Other. Default: General question |
| What happened? (message) | 10–10,000 characters for clinic requests; at most 5,000 for Rep app requests [TO CONFIRM: which limit is intended (contradiction 59)] |
| Reply | 1–10,000 characters |
| Reference | SR- followed by the last six characters of the request's identifier, in capitals |

The platform admin needs a platform-admin sign-in. Platform admins are the people on the platform-admin allowlist; they sign in with a single-use link sent by email, and removing an address from the allowlist ends that person's access at once (source: lib/platform-auth.ts).

Sources: lib/support.ts; components/admin/NewSupportRequest.tsx; lib/platform-console.ts; app/api/medical-representatives/support/route.ts.

## Procedure: receiving a request

1. **Clinic administrator, MyClinicSoft web app.** Opens Admin → Support, enters a subject, chooses the category under "About", describes the problem under "What happened?" and sends it. The system saves the request with status Open and shows the reference SR-XXXXXX.
2. **System, email (Resend).** Emails every platform admin "New support request SR-XXXXXX: <subject>", with the clinic name, the sender and a link to the request in the platform console. A failed email never blocks the request, so the queue is the record, not the inbox. For a Rep app request, the notice goes to support@myclinicsoft.solutions instead [TO CONFIRM: whether Rep app notices should also go to platform admins (contradiction 59)].
3. **Platform admin, platform console → Support.** Opens the view "Waiting on us", which lists requests that are Open or In progress where the requester spoke last. Other views: "All open", "Resolved" and "Everything". The console dashboard also shows the counts of open and waiting requests.
4. **Platform admin, platform console.** Opens the request, reads the thread, then opens the clinic's page to see its plan, subscription, payments and ten most recent requests.
5. **Platform admin, platform console → clinic → View as clinic.** If the problem has to be seen as the clinic sees it, opens the clinic as one of its active administrators: read-only, for 30 minutes, and written to the clinic's audit log. The clinic must have an active administrator and must not be suspended.
6. **Platform admin.** Decision point: if the request belongs to another procedure (see "When this procedure applies"), then hand it over and tell the clinic it has been passed on; if it asks for a refund or credit, then follow "Customer Support Playbook", section "Refunds, credits and exceptions"; otherwise go to step 7.

Sources: lib/support.ts; app/api/support/route.ts; app/(platform)/platform/support/page.tsx; lib/platform-console.ts; components/platform/ClinicActions.tsx.

## Procedure: answering and resolving

7. **Platform admin, platform console.** Writes the answer under "Reply" and presses "Send reply". If the request was Open, its status becomes In progress automatically. The requester receives an email "Re: <subject> [SR-XXXXXX]" and an in-app notification (push as well) that opens the request.
8. **Platform admin.** Decision point: if the answer fixes the problem, then press "Send and resolve" instead of "Send reply" (status Resolved; the email adds "We have marked it resolved. Reply from the app if anything is still wrong."); if more information is needed from the clinic, then send the reply and go to step 9.
9. **Clinic administrator, Admin → Support.** Replies in the app. A reply on a Resolved or Closed request sets it back to Open. Every platform admin is emailed "Reply SR-XXXXXX: <subject>". Go to step 3.
10. **Platform admin, platform console → Status.** Changes the status without replying when needed. Setting Resolved this way sends the requester the in-app notice "MyClinicSoft support marked your request resolved. Reply if anything is still wrong." No email is sent for a status change on its own.
11. **Platform admin.** Sets the status to Closed when the request is finished [TO CONFIRM: when a Resolved request is closed; the source files have no automatic closing rule].

Sources: lib/support.ts; app/api/platform/support/[id]/route.ts; app/api/platform/support/[id]/replies/route.ts; app/api/support/[id]/replies/route.ts; components/platform/SupportThread.tsx.

## Approvals required

The source files set no approval steps or limits inside this procedure. Platform admins can, from the clinic's page, extend the current trial or paid period by 1–365 days and suspend or reactivate a clinic. Who may approve a period extension, and up to how many days without approval, is [TO CONFIRM: approval rule and limit for period extensions]. Suspending a clinic signs every staff member out at once, so it needs [TO CONFIRM: who approves a suspension]. Prices and the rules for period extensions are in "Pricing and Discount Rules".

## Exceptions and what to do

| Situation | What happens or what to do |
|---|---|
| A staff member who is not an administrator wants help | The request is refused; the staff member asks the clinic administrator to open it |
| The clinic is suspended or the administrator cannot sign in | The administrator cannot use Admin → Support; the Help Center points them to support@myclinicsoft.solutions or the contact form |
| A patient writes about their medical records | The clinic manages the records, so the patient is referred to the clinic first; problems with the eMCR app itself stay with support (source: faq page) |
| The notification email to platform admins fails | The request is still saved; it appears in "Waiting on us" |
| A Rep app requester replies | The Rep app shows replies but has no reply button; the rep is told replies come by email [TO CONFIRM: where a rep's email reply arrives] |
| The request is about Enterprise support terms | Support hours and response times for Enterprise are agreed in the clinic's contract (source: support page) |

## Outputs and where they are recorded

| Output | Where it is recorded |
|---|---|
| The request, its replies, status, category, source (clinic or medical representative), last activity and who spoke last | The support request record in the MyClinicSoft database; visible in the platform console and to the clinic in Admin → Support (the clinic list shows up to 100 requests) |
| Emails to the requester and to platform admins | Sent through Resend; not stored on the request |
| In-app notifications to the requester | The requester's notifications |
| Period extensions, suspensions and reactivations | The clinic's audit log, with the platform admin's email and any reason given |
| View-as-clinic sessions | The clinic's audit log |

## Time targets

The source files give no response or resolution times. The published support hours are in "Company Overview", section "Working hours, time zone and currency" [TO CONFIRM: support hours are Asia/Manila time]. The contact page says "We reply during support hours, in the order messages arrive", and the FAQ says Professional and Enterprise requests are handled first. Response targets by priority are [TO CONFIRM: response and resolution targets]; Enterprise terms are covered under "Exceptions and what to do".

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Customer Support Playbook; Customer FAQ; Pricing and Discount Rules; Handling a Patient Data Erasure Request; Deleting a Closed Clinic's Data; Handling an SMS Opt-Out; Responding to a Suspected Data Breach; Onboarding a New Clinic; Issuing eMCR Activation Voucher Batches; Customer Support Agent: Lesson Pack; Company Overview |

## Open questions

1. [TO CONFIRM: support role title] and whether a separate support role exists or platform admins answer every request.
2. [TO CONFIRM: handling of support mailbox emails]: emails to support@myclinicsoft.solutions and contact-form messages do not create a support request. How are they tracked?
3. [TO CONFIRM: which limit is intended (contradiction 59)]: clinic requests allow 10–10,000 characters (lib/support.ts), Rep app requests allow at most 5,000 and set no minimum subject length (app/api/medical-representatives/support/route.ts).
4. [TO CONFIRM: whether Rep app notices should also go to platform admins (contradiction 59)]: clinic requests email every platform admin (lib/support.ts), Rep app requests email only support@myclinicsoft.solutions (app/api/medical-representatives/support/route.ts).
5. Reference format: the platform console and clinic app show "SR-" plus the last six characters of the identifier in capitals (`supportReference`, lib/platform-console.ts), while the Rep app API returns "SR-" plus the full identifier (`SR-${supportRequest._id}`, app/api/medical-representatives/support/route.ts). A rep and the platform admin will quote different references for the same request (contradiction 59).
6. [TO CONFIRM: where a rep's email reply arrives]: the Rep app has no reply action.
7. [TO CONFIRM: when a Resolved request is closed]: the source files have no automatic closing rule.
8. [TO CONFIRM: approval rule and limit for period extensions] and [TO CONFIRM: who approves a suspension].
9. [TO CONFIRM: support hours are Asia/Manila time] (components/PublicPage.tsx gives no time zone).
10. [TO CONFIRM: response and resolution targets]: none in the source files. The support level per plan follows the provisional public wording (contradiction 6).
11. [TO CONFIRM: owner role], effective date and review date.
