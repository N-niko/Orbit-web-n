import { z } from "zod";
import { OrbitApp } from "@/components/orbit-app";
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ listing?: string | string[] }> }) {
 const params = await searchParams;
 const id = z.uuid().safeParse(params.listing);
 return <OrbitApp initialMarketplace initialListing={id.success ? id.data : null} />;
}
