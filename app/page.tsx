import HomePageClient from "./HomePageClient";
import MarketingFooter from "./_components/MarketingFooter";
import MarketingHeader from "./_components/MarketingHeader";

export default function HomePage() {
  return (
    <div className="homepage-shared-chrome">
      <MarketingHeader />
      <HomePageClient />
      <MarketingFooter />
    </div>
  );
}
