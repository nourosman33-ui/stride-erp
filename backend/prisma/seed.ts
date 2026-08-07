import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ROLE_NAMES = ["owner", "manager", "cashier", "inventory_clerk", "accountant", "viewer"];

// Generic, royalty-free-style placeholder images — no real Nike/Adidas/Puma product
// photos are used (trademark risk). Swap Product.imageUrl for real photos later; nothing
// else in the code needs to change (see catalog dto / products.service.ts).
const CATEGORY_IMAGE_THEME: Record<string, string> = {
  Running: "e0f2fe/0369a1",
  Sneakers: "f3f4f6/111827",
  Casual: "fef3c7/92400e",
  Football: "dcfce7/166534",
  Basketball: "fee2e2/991b1b",
  Training: "ede9fe/5b21b6",
};

function placeholderImage(category: string, modelName: string): string {
  const theme = CATEGORY_IMAGE_THEME[category] ?? "f3f4f6/111827";
  return `https://placehold.co/500x500/${theme}?text=${encodeURIComponent(modelName)}`;
}

async function seedRolesAndUsers() {
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const seedUser = async (email: string, password: string, roleName: string, fullName: string) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User ${email} already exists, skipping.`);
      return existing;
    }
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { fullName, email, passwordHash, userRoles: { create: { roleId: role.id } } },
    });
    console.log(`Seeded ${roleName} user: ${email} / ${password} — CHANGE THIS PASSWORD IMMEDIATELY.`);
    return user;
  };

  const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@stride-erp.local";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "ChangeMe123!";
  const owner = await seedUser(ownerEmail, ownerPassword, "owner", "Store Owner");
  const manager = await seedUser("manager@stride-erp.local", "ChangeMe123!", "manager", "Store Manager");
  const cashier = await seedUser("cashier@stride-erp.local", "ChangeMe123!", "cashier", "Front Register");

  return { owner, manager, cashier };
}

async function seedCatalogLookups() {
  const categories = ["Running", "Sneakers", "Casual", "Football", "Basketball", "Training"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const genders = ["Men", "Women", "Kids", "Unisex"];
  for (const name of genders) {
    await prisma.gender.upsert({ where: { name }, update: {}, create: { name } });
  }

  const productTypes = ["Sneaker", "Sandal", "Boot", "Loafer", "Heel", "Flat", "Cleat"];
  for (const name of productTypes) {
    await prisma.productType.upsert({ where: { name }, update: {}, create: { name } });
  }

  const colors: { name: string; hex: string }[] = [
    { name: "Black", hex: "#111111" },
    { name: "White", hex: "#f8fafc" },
    { name: "Red", hex: "#dc2626" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Navy", hex: "#1e3a5f" },
    { name: "Grey", hex: "#6b7280" },
    { name: "Green", hex: "#16a34a" },
    { name: "Orange", hex: "#ea580c" },
    { name: "Brown", hex: "#78350f" },
  ];
  for (const c of colors) {
    await prisma.color.upsert({ where: { name: c.name }, update: {}, create: { name: c.name, hexCode: c.hex } });
  }

  const euSizes = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"];
  for (let i = 0; i < euSizes.length; i++) {
    await prisma.sizeValue.upsert({
      where: { standard_value: { standard: "EU", value: euSizes[i] } },
      update: {},
      create: { standard: "EU", value: euSizes[i], sortOrder: i },
    });
  }
}

async function seedStore(ownerId: string) {
  let store = await prisma.store.findFirst({ where: { isActive: true } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: "STRIDE Flagship",
        address: "El Warraq, Giza, Egypt",
        currency: "EGP",
        movementStatusRule: { create: {} },
      },
    });
  }
  return prisma.store.update({
    where: { id: store.id },
    data: {
      phone: store.phone ?? "01000009999",
      logoUrl: store.logoUrl ?? "https://placehold.co/200x200/18181b/f8fafc?text=STRIDE",
      taxNumber: store.taxNumber ?? "123-456-789",
      receiptFooterLine1: store.receiptFooterLine1 ?? "Thank you for shopping with us.",
      receiptFooterLine2:
        store.receiptFooterLine2 ??
        "Returns and exchanges are accepted within 14 days only in case of manufacturing defects and with the original receipt.",
    },
  });
}

async function seedSuppliers() {
  const suppliers = [
    { name: "Delta Footwear Factory", factoryName: "Delta Industrial Zone", phone: "01000000001", paymentTerms: "50% deposit / 50% on delivery", leadTimeDaysMin: 10, leadTimeDaysMax: 20, qualityRating: 4 },
    { name: "Nile Shoe Trading Co.", factoryName: "10th of Ramadan Factory", phone: "01000000002", paymentTerms: "Net 30", leadTimeDaysMin: 7, leadTimeDaysMax: 14, qualityRating: 5 },
    { name: "Cairo Sports Import", factoryName: null, phone: "01000000003", paymentTerms: "Cash on delivery", leadTimeDaysMin: 3, leadTimeDaysMax: 10, qualityRating: 3 },
  ];
  const created = [];
  for (const s of suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    created.push(existing ?? (await prisma.supplier.create({ data: s })));
  }
  return created;
}

interface ProductDef {
  brand: string;
  model: string;
  category: string;
  gender: string;
  productType: string;
  description: string;
}

const PRODUCTS: ProductDef[] = [
  { brand: "Nike", model: "Air Runner Pro", category: "Running", gender: "Men", productType: "Sneaker", description: "Lightweight cushioned running shoe for daily mileage." },
  { brand: "Nike", model: "Street Trainer", category: "Casual", gender: "Unisex", productType: "Sneaker", description: "Everyday casual sneaker with a clean silhouette." },
  { brand: "Nike", model: "Court Flex", category: "Basketball", gender: "Men", productType: "Sneaker", description: "High-top basketball shoe with ankle support." },
  { brand: "Nike", model: "Match Cleat", category: "Football", gender: "Men", productType: "Cleat", description: "Firm-ground football boot for grass pitches." },
  { brand: "Adidas", model: "Road Runner", category: "Running", gender: "Women", productType: "Sneaker", description: "Responsive foam midsole for road running." },
  { brand: "Adidas", model: "Street Classic", category: "Casual", gender: "Unisex", productType: "Sneaker", description: "Retro-inspired everyday casual trainer." },
  { brand: "Adidas", model: "Court Vantage", category: "Basketball", gender: "Men", productType: "Sneaker", description: "Low-top basketball shoe built for quick cuts." },
  { brand: "Adidas", model: "Pitch Pro", category: "Football", gender: "Men", productType: "Cleat", description: "Multi-ground football boot." },
  { brand: "Puma", model: "Speed Runner", category: "Running", gender: "Men", productType: "Sneaker", description: "Breathable mesh upper for warm-weather running." },
  { brand: "Puma", model: "Casual Glide", category: "Casual", gender: "Women", productType: "Sneaker", description: "Slip-on casual sneaker for everyday wear." },
  { brand: "Puma", model: "Court Star", category: "Basketball", gender: "Unisex", productType: "Sneaker", description: "Durable court shoe with reinforced sole." },
  { brand: "New Balance", model: "Comfort Runner", category: "Running", gender: "Men", productType: "Sneaker", description: "Wide-fit running shoe with extra cushioning." },
  { brand: "New Balance", model: "Street Walker", category: "Casual", gender: "Unisex", productType: "Sneaker", description: "All-day comfort walking sneaker." },
  { brand: "New Balance", model: "Trail Trainer", category: "Training", gender: "Men", productType: "Sneaker", description: "Cross-training shoe with grippy outsole." },
  { brand: "Skechers", model: "Go Walk", category: "Casual", gender: "Women", productType: "Flat", description: "Ultra-light slip-on for all-day comfort." },
  { brand: "Skechers", model: "Comfort Flex", category: "Training", gender: "Unisex", productType: "Sneaker", description: "Flexible training shoe for the gym." },
  { brand: "Skechers", model: "Casual Slip", category: "Casual", gender: "Kids", productType: "Flat", description: "Easy slip-on sneaker for kids." },
  { brand: "Asics", model: "Gel Runner", category: "Running", gender: "Men", productType: "Sneaker", description: "Gel cushioning for long-distance comfort." },
  { brand: "Asics", model: "Court Speed", category: "Basketball", gender: "Women", productType: "Sneaker", description: "Lightweight court shoe for fast play." },
  { brand: "Asics", model: "Trail Grip", category: "Training", gender: "Men", productType: "Sneaker", description: "Rugged trail-ready training shoe." },
  { brand: "Converse", model: "Classic High", category: "Sneakers", gender: "Unisex", productType: "Sneaker", description: "Timeless high-top canvas sneaker." },
  { brand: "Converse", model: "Classic Low", category: "Sneakers", gender: "Unisex", productType: "Sneaker", description: "Timeless low-top canvas sneaker." },
  { brand: "Vans", model: "Old School Low", category: "Sneakers", gender: "Unisex", productType: "Sneaker", description: "Iconic side-stripe skate sneaker." },
  { brand: "Vans", model: "Skate Classic", category: "Training", gender: "Kids", productType: "Sneaker", description: "Durable skate shoe built for kids on the move." },
];

const VARIANT_SIZES = ["39", "40", "41", "42", "43"];
const VARIANT_COLOR_SETS = [
  ["Black", "White"],
  ["Black", "Red"],
  ["Navy", "Grey"],
  ["White", "Blue"],
  ["Black", "Green"],
  ["Grey", "Orange"],
  ["Brown", "Black"],
];

function priceForIndex(i: number): { cost: number; selling: number } {
  // Cycles through the EGP 180-350 cost / 320-650 selling ranges from the spec while
  // keeping a healthy, consistent margin.
  const cost = 180 + (i * 23) % 171; // 180..350
  const margin = 1.55 + ((i % 5) * 0.08); // 1.55x..1.87x
  const selling = Math.min(650, Math.max(320, Math.round((cost * margin) / 5) * 5));
  return { cost, selling };
}

async function seedProductsAndStock(store: { id: string }, suppliers: { id: string }[], ownerId: string) {
  const [categories, genders, productTypes, colors, sizes] = await Promise.all([
    prisma.category.findMany(),
    prisma.gender.findMany(),
    prisma.productType.findMany(),
    prisma.color.findMany(),
    prisma.sizeValue.findMany({ where: { standard: "EU" } }),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.name, c]));
  const genderMap = new Map(genders.map((g) => [g.name, g]));
  const typeMap = new Map(productTypes.map((t) => [t.name, t]));
  const colorMap = new Map(colors.map((c) => [c.name, c]));
  const sizeMap = new Map(sizes.map((s) => [s.value, s]));

  let barcodeCounter = 900000000001;
  const allVariants: { id: string; costPrice: number }[] = [];

  for (let i = 0; i < PRODUCTS.length; i++) {
    const def = PRODUCTS[i];
    const { cost, selling } = priceForIndex(i);

    const product = await prisma.product.create({
      data: {
        modelName: `${def.brand} ${def.model}`,
        brand: def.brand,
        categoryId: categoryMap.get(def.category)!.id,
        genderId: genderMap.get(def.gender)!.id,
        productTypeId: typeMap.get(def.productType)!.id,
        baseCostPrice: cost,
        baseSellingPrice: selling,
        description: def.description,
        imageUrl: placeholderImage(def.category, `${def.brand} ${def.model}`),
      },
    });

    // A preferred supplier link, rotating through the three seeded suppliers.
    await prisma.productSupplier.create({
      data: {
        productId: product.id,
        supplierId: suppliers[i % suppliers.length].id,
        supplierCostPrice: cost,
        piecesPerCarton: 12,
        isPreferred: true,
      },
    });

    const colorSet = VARIANT_COLOR_SETS[i % VARIANT_COLOR_SETS.length];
    const sizeSet = [VARIANT_SIZES[i % 3], VARIANT_SIZES[(i % 3) + 1], VARIANT_SIZES[(i % 3) + 2]];

    for (const colorName of colorSet) {
      for (const sizeValue of sizeSet) {
        const barcode = String(barcodeCounter++);
        const sku = `${def.brand.slice(0, 3).toUpperCase()}-${String(i).padStart(3, "0")}-${colorName.slice(0, 3).toUpperCase()}-${sizeValue}`;
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            colorId: colorMap.get(colorName)!.id,
            sizeValueId: sizeMap.get(sizeValue)!.id,
            barcode,
            sku,
            reorderPoint: 5,
          },
        });
        allVariants.push({ id: variant.id, costPrice: cost });
      }
    }
  }

  // Initial stock — posted as `receipt` ledger entries (the only entry_type valid for
  // adding stock outside a real goods receipt) so stock-on-hand is correct from the
  // start, same derivation InventoryService.getStockOnHand uses everywhere else.
  for (const v of allVariants) {
    const qty = 15 + Math.floor(Math.random() * 25); // 15..39 units
    await prisma.stockLedgerEntry.create({
      data: {
        storeId: store.id,
        variantId: v.id,
        entryType: "receipt",
        quantityDelta: qty,
        unitCost: v.costPrice,
        referenceType: "manual",
        performedById: ownerId,
      },
    });
  }

  console.log(`Seeded ${PRODUCTS.length} products / ${allVariants.length} variants with opening stock.`);
  return allVariants;
}

async function seedCustomers() {
  const customers = [
    { name: "Ahmed Hassan", phone: "01011112222", email: "ahmed.hassan@example.com", gender: "male", birthDate: new Date("1990-03-14") },
    { name: "Mona Youssef", phone: "01022223333", email: "mona.youssef@example.com", gender: "female", birthDate: new Date("1995-07-22") },
    { name: "Karim Adel", phone: "01033334444", email: "karim.adel@example.com", gender: "male", birthDate: new Date("1988-11-05") },
    { name: "Nour Ibrahim", phone: "01044445555", email: "nour.ibrahim@example.com", gender: "female", birthDate: new Date("2000-01-30") },
    { name: "Youssef Tarek", phone: "01055556666", email: "youssef.tarek@example.com", gender: "male", birthDate: new Date("1993-09-18") },
    { name: "Salma Mostafa", phone: "01066667777", email: "salma.mostafa@example.com", gender: "female", birthDate: new Date("1998-05-09") },
  ];
  const created = [];
  for (const c of customers) {
    const existing = await prisma.customer.findUnique({ where: { phone: c.phone } });
    created.push(existing ?? (await prisma.customer.create({ data: c })));
  }
  return created;
}

async function seedSalesHistory(
  store: { id: string; vatRate: unknown; loyaltyPointsPerCurrency: unknown },
  cashierId: string,
  customers: { id: string }[],
  variants: { id: string; costPrice: number }[],
) {
  const vatRate = Number(store.vatRate);
  const pointsPerCurrency = Number(store.loyaltyPointsPerCurrency);
  const productRows = await prisma.productVariant.findMany({
    where: { id: { in: variants.map((v) => v.id) } },
    include: { product: true },
  });
  const variantById = new Map(productRows.map((v) => [v.id, v]));

  // Continue the store's real invoice sequence rather than resetting to 0 — this DB may
  // already have real invoices from earlier POS use, and invoice_number is unique.
  const currentStore = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  let invoiceSeq = currentStore.invoiceSeq;
  const ORDER_COUNT = 22;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const daysAgo = Math.floor(Math.random() * 29); // spread across the last ~4 weeks, incl. today
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - daysAgo);
    orderDate.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

    const lineCount = 1 + Math.floor(Math.random() * 3);
    const chosenVariants = [...variants].sort(() => Math.random() - 0.5).slice(0, lineCount);

    let subtotal = 0;
    let taxTotal = 0;
    const lineData = chosenVariants.map((v) => {
      const row = variantById.get(v.id)!;
      const unitPrice = Number(row.sellingPriceOverride ?? row.product.baseSellingPrice);
      const quantity = 1 + Math.floor(Math.random() * 2);
      const netPrice = Number((unitPrice * quantity).toFixed(2));
      const taxAmount = Number((netPrice * (vatRate / 100)).toFixed(2));
      subtotal += unitPrice * quantity;
      taxTotal += taxAmount;
      return { variantId: v.id, quantity, unitPrice, discountAmount: 0, netPrice, taxAmount };
    });
    subtotal = Number(subtotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    const grandTotal = Number((subtotal + taxTotal).toFixed(2));

    const customer = Math.random() > 0.25 ? customers[Math.floor(Math.random() * customers.length)] : null;
    const pointsEarned = customer ? Math.floor(grandTotal * pointsPerCurrency) : 0;

    invoiceSeq += 1;
    const invoiceNumber = `INV-${store.id.slice(0, 8).toUpperCase()}-${String(invoiceSeq).padStart(6, "0")}`;

    const order = await prisma.salesOrder.create({
      data: {
        storeId: store.id,
        invoiceNumber,
        customerId: customer?.id,
        cashierId,
        orderDate,
        subtotal,
        discountTotal: 0,
        taxTotal,
        grandTotal,
        pointsEarned,
        pointsRedeemed: 0,
        status: "completed",
        lines: { create: lineData },
        payments: { create: [{ method: "cash", amount: grandTotal }] },
      },
    });

    for (const line of lineData) {
      await prisma.stockLedgerEntry.create({
        data: {
          storeId: store.id,
          variantId: line.variantId,
          entryType: "sale",
          quantityDelta: -line.quantity,
          referenceType: "sales_order",
          referenceId: order.id,
          performedById: cashierId,
          createdAt: orderDate,
        },
      });
    }

    if (customer && pointsEarned > 0) {
      await prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.id,
          storeId: store.id,
          type: "earn",
          pointsDelta: pointsEarned,
          referenceType: "sales_order",
          referenceId: order.id,
          performedById: cashierId,
          createdAt: orderDate,
        },
      });
    }
  }

  await prisma.store.update({ where: { id: store.id }, data: { invoiceSeq } });
  console.log(`Seeded ${ORDER_COUNT} historical sales orders.`);
}

async function main() {
  const { owner, cashier } = await seedRolesAndUsers();
  await seedCatalogLookups();
  const store = await seedStore(owner.id);
  const suppliers = await seedSuppliers();

  const seededBrands = [...new Set(PRODUCTS.map((p) => p.brand))];
  const existingSeedProducts = await prisma.product.count({ where: { brand: { in: seededBrands } } });
  if (existingSeedProducts > 0) {
    console.log(`${existingSeedProducts} demo product(s) already exist, skipping catalog/stock/sales seed.`);
    return;
  }

  const variants = await seedProductsAndStock(store, suppliers, owner.id);
  const customers = await seedCustomers();
  await seedSalesHistory(store, cashier.id, customers, variants);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
