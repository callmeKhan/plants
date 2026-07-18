import { round2 } from "@/lib/number";

export type StoreProduct = {
  id: string;
  product_code: number | null;
  name: string;
  unit_price: number;
  created_at: string;
  updated_at: string;
};

export type StoreCustomer = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type StoreSaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  created_at: string;
};

export type StoreSale = {
  id: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  sold_date: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items: StoreSaleItem[];
};

export type StoreSalesData = {
  products: StoreProduct[];
  customers: StoreCustomer[];
  sales: StoreSale[];
};

export type StoreSalePeriodStat = {
  period: string;
  total_amount: number;
  total_quantity: number;
  sale_count: number;
  products: StoreSalePeriodProductStat[];
};

export type StoreSalePeriodProductStat = {
  id: string;
  name: string;
  total_amount: number;
  total_quantity: number;
};

export type StoreSaleProductStat = {
  id: string;
  name: string;
  total_amount: number;
  total_quantity: number;
  sale_count: number;
};

export type StoreSaleCustomerStat = {
  id: string;
  name: string;
  total_amount: number;
  total_quantity: number;
  sale_count: number;
};

export type StoreSaleStats = {
  periods: StoreSalePeriodStat[];
  products: StoreSaleProductStat[];
  customers: StoreSaleCustomerStat[];
  totals: {
    total_amount: number;
    total_quantity: number;
    sale_count: number;
    product_count: number;
    customer_count: number;
  };
};

export function normalizeStoreSalesData(value: unknown): StoreSalesData {
  const source = value && typeof value === "object" ? value as Partial<StoreSalesData> : {};
  return {
    products: Array.isArray(source.products)
      ? source.products.map((product) => {
        const productCode = Number(product.product_code);
        return {
          ...product,
          product_code: Number.isInteger(productCode) && productCode > 0 ? productCode : null,
        };
      })
      : [],
    customers: Array.isArray(source.customers) ? source.customers : [],
    sales: Array.isArray(source.sales)
      ? source.sales.map((sale) => ({ ...sale, items: Array.isArray(sale.items) ? sale.items : [] }))
      : [],
  };
}

export function sortStoreSales(sales: StoreSale[]) {
  return [...sales].sort((a, b) => {
    return b.sold_date.localeCompare(a.sold_date) || b.created_at.localeCompare(a.created_at);
  });
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getStoreSalePeriod(
  soldDate: string,
  granularity: "day" | "month",
  monthStartDay: number,
) {
  if (granularity === "day") return soldDate;

  const [year, month, day] = soldDate.split("-").map(Number);
  if (!year || !month || !day) return soldDate.slice(0, 7);

  const normalizedStartDay = Math.min(31, Math.max(1, Math.trunc(monthStartDay) || 1));
  const boundaryDay = Math.min(normalizedStartDay, daysInMonth(year, month));
  let periodYear = year;
  let periodMonth = month;

  if (day < boundaryDay) {
    periodMonth -= 1;
    if (periodMonth === 0) {
      periodMonth = 12;
      periodYear -= 1;
    }
  }

  return `${periodYear}-${String(periodMonth).padStart(2, "0")}`;
}

export function buildStoreSaleStats(
  sales: StoreSale[],
  granularity: "day" | "month",
  monthStartDay = 1,
): StoreSaleStats {
  const periodMap = new Map<string, StoreSalePeriodStat>();
  const periodProductMaps = new Map<string, Map<string, StoreSalePeriodProductStat>>();
  const productMap = new Map<string, StoreSaleProductStat>();
  const customerMap = new Map<string, StoreSaleCustomerStat>();
  const productIds = new Set<string>();
  const customerIds = new Set<string>();
  let totalAmount = 0;
  let totalQuantity = 0;

  for (const sale of sales) {
    const period = getStoreSalePeriod(sale.sold_date, granularity, monthStartDay);
    const quantity = round2(sale.items.reduce((sum, item) => sum + Number(item.quantity), 0));
    const amount = round2(Number(sale.total_amount));
    const periodStat = periodMap.get(period) ?? {
      period,
      total_amount: 0,
      total_quantity: 0,
      sale_count: 0,
      products: [],
    };
    periodStat.total_amount = round2(periodStat.total_amount + amount);
    periodStat.total_quantity = round2(periodStat.total_quantity + quantity);
    periodStat.sale_count += 1;
    periodMap.set(period, periodStat);

    const customerKey = sale.customer_id ?? `deleted:${sale.customer_name_snapshot.trim().toLocaleLowerCase("vi")}`;
    const customer = customerMap.get(customerKey) ?? {
      id: customerKey,
      name: sale.customer_name_snapshot,
      total_amount: 0,
      total_quantity: 0,
      sale_count: 0,
    };
    customer.total_amount = round2(customer.total_amount + amount);
    customer.total_quantity = round2(customer.total_quantity + quantity);
    customer.sale_count += 1;
    customerMap.set(customerKey, customer);
    customerIds.add(customerKey);

    for (const item of sale.items) {
      const periodProducts = periodProductMaps.get(period) ?? new Map<string, StoreSalePeriodProductStat>();
      const periodProduct = periodProducts.get(item.product_id) ?? {
        id: item.product_id,
        name: item.product_name_snapshot,
        total_amount: 0,
        total_quantity: 0,
      };
      periodProduct.total_amount = round2(periodProduct.total_amount + Number(item.line_total));
      periodProduct.total_quantity = round2(periodProduct.total_quantity + Number(item.quantity));
      periodProducts.set(item.product_id, periodProduct);
      periodProductMaps.set(period, periodProducts);

      const product = productMap.get(item.product_id) ?? {
        id: item.product_id,
        name: item.product_name_snapshot,
        total_amount: 0,
        total_quantity: 0,
        sale_count: 0,
      };
      product.total_amount = round2(product.total_amount + Number(item.line_total));
      product.total_quantity = round2(product.total_quantity + Number(item.quantity));
      product.sale_count += 1;
      productMap.set(item.product_id, product);
      productIds.add(item.product_id);
    }

    totalAmount = round2(totalAmount + amount);
    totalQuantity = round2(totalQuantity + quantity);
  }

  return {
    periods: Array.from(periodMap.values())
      .map((period) => ({
        ...period,
        products: Array.from(periodProductMaps.get(period.period)?.values() ?? []),
      }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    products: Array.from(productMap.values()).sort((a, b) => b.total_amount - a.total_amount),
    customers: Array.from(customerMap.values()).sort((a, b) => b.total_amount - a.total_amount),
    totals: {
      total_amount: totalAmount,
      total_quantity: totalQuantity,
      sale_count: sales.length,
      product_count: productIds.size,
      customer_count: customerIds.size,
    },
  };
}
