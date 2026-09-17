import { markEmailOpened } from "@/lib/email-analytics";
const pixel=Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=","base64");
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;await markEmailOpened(id)}catch{}return new Response(pixel,{headers:{"content-type":"image/gif","cache-control":"no-store, no-cache, must-revalidate, max-age=0"}})}
