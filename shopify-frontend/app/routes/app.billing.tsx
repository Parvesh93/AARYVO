import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
export async function loader({ request }: LoaderFunctionArgs) { await authenticate.admin(request); return null; }
export default function Billing() {
 return <s-page heading="AARYVO Shopify billing">
  <s-section heading="Shopify App Pricing">
   <s-paragraph>Starter $9/month, Growth $19/month, Pro $39/month.</s-paragraph>
   <s-paragraph>Billing is intentionally read-only in this staging scaffold until the existing App Pricing subscription verification is connected.</s-paragraph>
   <s-paragraph>No external checkout is available in this Shopify app.</s-paragraph>
  </s-section>
 </s-page>;
}
export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
