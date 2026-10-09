import { redirect, type LoaderFunctionArgs } from "react-router";
export async function loader({ request }: LoaderFunctionArgs) {
 const url = new URL(request.url);
 if (url.searchParams.has("shop")) throw redirect("/app?" + url.searchParams.toString());
 return null;
}
export default function Entry() {
 return <main style={{ maxWidth: 650, margin: "80px auto", padding: 24, fontFamily: "system-ui" }}>
 <h1>AARYVO AI Shopping Assistant</h1>
 <p>Open AARYVO from your Shopify Admin Apps section to authenticate and continue.</p>
 </main>;
}
