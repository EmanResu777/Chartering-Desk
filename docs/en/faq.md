# Frequently Asked Questions (FAQ)

## User-Facing
**Why I do not see Apple Sign-In?**
Apple Sign-In is technically supported in the code but requires external Apple Developer and Firebase configuration before it is exposed to users.

**Why Gmail is not required during registration?**
Registration is separated from the email sync layer. You can create an account and manually add data first, and optionally connect Gmail later from your Inbox or Settings.

**Why is an alert not visible?**
Alerts are personalized. If you do not have permission to view the underlying asset (e.g., a Deal Room associated with another desk), you will not receive an alert. You can also inadvertently block alerts through your preferences.

**Why is my Daily Digest empty?**
The digest aggregates activity linked directly to your desk/portfolio. If there is no activity, no matching radar results, or no urgent deal rooms needing your input in the last 24 hours, the digest remains blank.

**Why can another desk user not see my Deal Room?**
Deal Rooms restrict access strictly to the creating desk and counter-party desk members. Cross-desk peeking is prohibited.

**Why are hidden vessel names not shown in alerts?**
To protect commercial integrity, if a shared listing obscures the vessel name, the generated alerts or digest content will likewise obscure it.

**Why did AI Deal Brief consume (or not consume) credits?**
Viewing an already-generated Deal Brief is free. Generating a new one or forcing a regeneration consumes credits. Failed generation attempts do not consume credits.

**What does Broker-side Confirmation mean?**
Broker-side confirmation is an internal alignment tool indicating that the parties agree on the working draft parameters. It does not execute a contract on behalf of principals.

**Does the system create final fixtures or charter parties automatically?**
No. The platform is an analytical and structuring tool. Final fixture authorizations and charter party drafting always remain external, manual processes.

**What is Chartering Desk?**
An AI-powered collaboration and email-sync platform for the dry bulk shipbroking community.

**Is broker-side confirmation legally binding?**
No. Broker-side confirmation represents working draft alignment inside the platform. It does not replace final fixture authorization or charter party execution by your principals.

**Can I export the recap as a PDF/DOCX?**
Yes. You can export fully formatted Recaps once a deal draft exists.

**Why did an email go to Skipped?**
Our AI classifies operational, SaaS alerts, subscription newsletters, and casual emails as 'Skipped' to save you time and preserve your usage credits.

**Why do I have no credits?**
Depending on your usage plan, you receive a set number of AI extraction credits per period. Once exhausted, you receive a 'Payment Required' alert and must wait for resetting or upgrade.

**How do I upgrade?**
Navigate to "Settings -> Billing" to access the integrated Stripe checkout portal.

**Can recipients edit my shared cargo/vessel?**
No. Shared items restrict write/edit access exclusively to the owner.

**What happens after dual approval?**
Once both the Cargo side and Vessel side approve an urgent deal, you unlock the OceanPact Recap Draft editor.

**What happens after recap confirmation?**
When both parties confirm the draft, it transitions into a read-only locked format.

**Does the platform send the recap automatically?**
No. You remain fully in control. You export the document and communicate it externally according to your operational manual.

**What is Hot Opps?**
Hot Opps automatically surfaces matching urgent items actively pushed to the network.

---

## Admin-Facing

**How does admin test mode work?**
Admins verified by `ADMIN_UIDS` silently bypass `402` credit blocks. This enables testing core software loops without accidentally charging founder credit cards.

**Are Gmail tokens exposed?**
No. Google OAuth tokens are handled server-side ensuring total privacy and API adherence.
