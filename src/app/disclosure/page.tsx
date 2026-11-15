import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Affiliate disclosure · Homer" };

export default function DisclosurePage() {
  return (
    <LegalPage title="Affiliate disclosure">
        <p>
          Homer is free to use. Some products in our catalog come from retail partners. When you click a &ldquo;Buy&rdquo; or &ldquo;View &amp; buy&rdquo; link and then make a
          purchase, we may earn a commission from that retailer. You pay the same price either way.
        </p>
        <p>
          Commissions never change how products fit your space. Our layout engine places furniture by its real dimensions and clearances, and our AI designer is
          instructed to recommend what fits your room, style and budget.
        </p>
        <p>
          Prices, availability and dimensions come from each retailer&apos;s product feed and are refreshed regularly, but the retailer&apos;s site is always the final
          word. Items labeled &ldquo;sample&rdquo; are planning placeholders and aren&apos;t for sale.
        </p>
        <p>
          When you click a buy link we record which product was clicked, the project it came from, and the time, and pass an anonymous click ID to the retailer&apos;s
          affiliate network so the sale can be credited. We don&apos;t share your designs or personal details with retailers.
        </p>
    </LegalPage>
  );
}
