import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
 const { admin } = await authenticate.admin(request);
 const response = await admin.graphql(`#graphql
   query AaryvoOverview { shop { name myshopifyDomain } productsCount { count } }`);
 if (!response.ok) throw new Response("Unable to access Shopify store.", { status: 502 });
 const result = await response.json();
 if (result.errors || !result.data?.shop) throw new Response("Shopify API returned an error.", { status: 502 });
 return {
   shop: result.data.shop as { name: string; myshopifyDomain: string },
   products: result.data.productsCount?.count as number | undefined,
 };
}

export default function Dashboard() {
 const { shop, products } = useLoaderData<typeof loader>();
 return <s-page heading="AARYVO AI Shopping Assistant">
   <s-section heading={`Welcome, ${shop.name}`}>
     <s-paragraph>Shopify authenticated: {shop.myshopifyDomain}.</s-paragraph>
     <s-paragraph>This isolated frontend will connect to the existing AARYVO AI engine through a secure backend bridge in the next phase.</s-paragraph>
   </s-section>
   <s-section heading="Shopify catalog">
     <s-paragraph>{typeof products === "number" ? `${products.toLocaleString()} products detected` : "Catalog count unavailable"}.</s-paragraph>
     <s-link href="/app/catalog">View product preview</s-link>
   </s-section>
   <s-section slot="aside" heading="Billing">
     <s-paragraph>Shopify-managed App Pricing. This frontend has no Razorpay integration.</s-paragraph>
     <s-link href="/app/billing">View billing status</s-link>
   </s-section>
 </s-page>;
}
export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
