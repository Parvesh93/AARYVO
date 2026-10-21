export type MerchantListQuery = { page: number; pageSize: number; search: string };
export function listQuery(data: Record<string, unknown>): MerchantListQuery {
  const rawPage=data.page;
  const page=typeof rawPage==="number" && Number.isInteger(rawPage) &&
    rawPage>=0 && rawPage<=2000 ? rawPage : 0;
  return {
    page,
    pageSize:25,
    search:typeof data.search==="string" ? data.search.trim().slice(0,80) : "",
  };
}
export function searchPage<T>(
  items:T[], total:number, query:MerchantListQuery,
  extra:Record<string,unknown>={},
){
  return {
    items, total, ...query,
    pageCount:Math.ceil(total/query.pageSize),
    ...extra,
  };
}
