import type { TranslationKey } from "@/lib/i18n/locale-context";
import type { PaymentMethodType } from "@/lib/api/types";

export const PAYMENT_METHOD_KEY: Record<PaymentMethodType, TranslationKey> = {
  cash: "pos.methodCash",
  card: "pos.methodCard",
  mobile_wallet: "pos.methodMobileWallet",
  bank_transfer: "pos.methodBankTransfer",
};
