import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy policy · Homer" };

// Plain-language starting point that matches what the app actually does today.
// Have it reviewed before launch; requirements vary by region (e.g. CCPA, GDPR).
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2026">
      <p>This policy explains what Homer collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your designs.</strong> Floor plans you upload, room layouts, furniture placements, project names and your conversations with the AI designer.
          Depending on how Homer is set up, these are stored in your browser or in our database, linked to an anonymous account ID.
        </li>
        <li>
          <strong>Shopping clicks.</strong> When you click a buy link we record the product, the project it came from, and the time, plus a random click ID
          that we pass to the retailer&apos;s affiliate network so a purchase can be credited.
        </li>
        <li>
          <strong>Basic technical data</strong> our hosting provider logs automatically, such as IP address and browser type, for security and reliability.
        </li>
      </ul>
      <p>We don&apos;t ask for your name, email or payment details to use Homer, and we don&apos;t sell personal information.</p>
      <h2>Service providers</h2>
      <ul>
        <li>AI providers process your requests and uploaded floor plans to generate designs, read floor plans, and create visualizations.</li>
        <li>Our hosting and database providers store and serve the app and your saved projects.</li>
        <li>Affiliate networks and retailers receive the click ID when you follow a buy link, and their own privacy policies apply on their sites.</li>
      </ul>
      <h2>Cookies and local storage</h2>
      <p>
        Homer uses browser storage to save your projects and settings and to keep you signed in to your anonymous account. Retailer and affiliate network sites
        you visit through our links may set their own cookies to track purchases.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Delete any project from your dashboard at any time.</li>
        <li>Clearing your browser&apos;s site data removes locally stored projects.</li>
        <li>Contact us to request access to, or deletion of, data linked to your account.</li>
      </ul>
      <h2>Contact</h2>
      <p>{CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a> : "Contact details coming soon."}</p>
    </LegalPage>
  );
}
