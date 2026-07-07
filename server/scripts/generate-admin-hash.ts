import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("用法: pnpm --filter @gewehub/server exec tsx scripts/generate-admin-hash.ts <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log(hash);
