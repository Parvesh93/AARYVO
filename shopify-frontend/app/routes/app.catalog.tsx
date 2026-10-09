import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
 const { admin } = await authenticate.admin(request);
 const response = await admin.graphql(`#graphql
  query AaryvoProductPreview { products(first: 8) { nodes { id title status } } }`);
 if (!response.ok) throw new Response("Unable to load Shopify catalog.", { status: 502 });
 const result = await response.json();
 if (result.errors || !result.data?.products) throw new Response("Shopify returned a catalog error.", { status: 502 });
 return { products: result.data.products.nodes as Array<{ id: string; title: string; status: string }> };
}
export default function Catalog() {
 const { products } = useLoaderData<typeof loader>();
 return <s-page heading="Catalog preview">
  <s-section heading="Shopify products">
   <s-paragraph>Read-only preview via authenticated Shopify API. AARYVO backend synchronization is not connected in this phase.</s-paragraph>
   {products.map(item => <s-box key={item.id} padding="base" borderRadius="base" borderWidth="base">
    <s-text>{item.title} — {item.status}</s-text></s-box>)}
  </s-section>
 </s-page>;
}
export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
