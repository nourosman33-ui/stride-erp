import Link from "next/link";
import { Store } from "lucide-react";

import { useLocale } from "@/lib/i18n/locale-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function NoStoreSelected() {
  const { t } = useLocale();
  return (
    <Alert>
      <Store />
      <AlertTitle>{t("common.noStoreTitle")}</AlertTitle>
      <AlertDescription>
        <p>{t("common.noStoreDesc")}</p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/settings/store">{t("common.noStoreCta")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
