import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ROLE_NAMES = ["owner", "manager", "cashier", "inventory_clerk", "accountant", "viewer"];

async function main() {
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@stride-erp.local";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "ChangeMe123!";

  const existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!existingOwner) {
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: "owner" } });
    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    await prisma.user.create({
      data: {
        fullName: "Store Owner",
        email: ownerEmail,
        passwordHash,
        userRoles: { create: { roleId: ownerRole.id } },
      },
    });
    console.log(
      `Seeded owner user: ${ownerEmail} / ${ownerPassword} — CHANGE THIS PASSWORD IMMEDIATELY.`,
    );
  } else {
    console.log(`Owner user ${ownerEmail} already exists, skipping.`);
  }

  // Seed core catalog lookups so Phase 1 can be exercised end-to-end immediately.
  const categories = ["Casual", "Sport", "Formal", "Sandal", "Boot", "School"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const genders = ["Men", "Women", "Kids", "Unisex"];
  for (const name of genders) {
    await prisma.gender.upsert({ where: { name }, update: {}, create: { name } });
  }

  const productTypes = ["Sneaker", "Sandal", "Boot", "Loafer", "Heel", "Flat"];
  for (const name of productTypes) {
    await prisma.productType.upsert({ where: { name }, update: {}, create: { name } });
  }

  const colors = ["Black", "White", "Brown", "Navy", "Red", "Grey"];
  for (const name of colors) {
    await prisma.color.upsert({ where: { name }, update: {}, create: { name } });
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
