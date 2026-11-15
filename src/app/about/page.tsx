import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "About · Homer" };

export default function AboutPage() {
  return (
    <LegalPage title="About Homer">
      <p>
        Homer helps renters and homeowners plan their space before they buy anything. Upload a floor plan, describe how you want to live, and Homer&apos;s AI
        designer furnishes it at true scale in 2D and 3D, keeping walkways, door swings and clearances clear.
      </p>
      <p>
        Every piece in a design uses its real dimensions. Products from our retail partners can be placed directly into your plan, so you can see exactly what
        fits, what it looks like with the rest of your furniture, and what the whole room costs.
      </p>
      <h2>How we make money</h2>
      <p>
        Homer is free to use. When you buy a product through a link on Homer, the retailer may pay us a commission at no extra cost to you. Details are in our{" "}
        <a href="/disclosure" className="underline underline-offset-2">affiliate disclosure</a>.
      </p>
      <h2>Contact</h2>
      <p>{CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a> : "Contact details coming soon."}</p>
    </LegalPage>
  );
}
