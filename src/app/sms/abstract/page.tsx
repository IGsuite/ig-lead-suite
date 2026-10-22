import { AbstractSmsSignup } from "@/components/abstract-sms-signup";
import { ABSTRACT_PRIVACY_URL, SMS_PRIVACY } from "@/lib/sms-consent";

export const metadata = { title: "Text updates | Abstract Capital Group" };

export default function AbstractSmsPage() {
  return <main className="mx-auto max-w-2xl space-y-8 px-6 py-12 text-[color:var(--ink)]">
    <header className="space-y-3">
      <a href="https://abstractcapitalgroup.com" className="text-sm underline">Abstract Capital Group</a>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Choose your text updates</h1>
      <p>Abstract helps business owners assess their needs, strengthen their businesses, and explore third-party financing options. Abstract is not a direct lender.</p>
      <p className="text-sm">Our text program is awaiting activation. You can record your SMS choice here; submitting this form does not send a text or apply for financing.</p>
    </header>
    <AbstractSmsSignup />
    <section id="sms-terms" className="space-y-3 border-t border-[color:var(--ink-border)] pt-6 text-sm">
      <h2 className="text-xl font-medium">SMS program terms</h2>
      <p>Abstract Capital Group’s text program covers business advisory services and financing assistance. Participation is optional and is not a condition of purchasing services. Message frequency varies, and message and data rates may apply. Reply STOP to unsubscribe or HELP for assistance once the program is active. A request for help or an incoming conversation does not automatically enroll you in marketing texts.</p>
      <p>For help now, email <a className="underline" href="mailto:info@abstractcapitalgroup.com">info@abstractcapitalgroup.com</a>. Carriers are not responsible for delayed or undelivered messages.</p>
      <p>See Abstract’s <a className="underline" href="https://abstractcapitalgroup.com/acg-redesign-terms-of-service/">general terms</a>.</p>
    </section>
    <section id="sms-privacy" className="space-y-3 text-sm">
      <h2 className="text-xl font-medium">SMS privacy</h2>
      <p>{SMS_PRIVACY}</p>
      <p>This form records your phone number, choice, time, signup page, and the consent wording shown. We keep these records to manage your preferences and demonstrate permission. Importing a phone list does not establish SMS consent. General financing inquiries and applications are separate from this SMS choice.</p>
      <p>See Abstract’s <a className="underline" href={ABSTRACT_PRIVACY_URL}>general privacy policy</a>. Contact info@abstractcapitalgroup.com to request access to or correction of your information, or to withdraw permission.</p>
    </section>
  </main>;
}
